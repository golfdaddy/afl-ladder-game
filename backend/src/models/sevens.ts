import { PoolClient } from 'pg'
import { db } from '../db'
import { SquiggleService } from '../services/squiggle'

// ── Rules ────────────────────────────────────────────────────────────────────

export const FORMATION: Record<string, number> = { BACK: 2, MID: 2, RUCK: 1, FWD: 2 }
export const TEAM_SIZE = 7
export const DEFAULT_BUDGET = 40 // Ƒ for 7 players — forces star-vs-spread choices
export const MAX_PRICE = 10
const MIN_GAMES = 4              // games of form needed to be priced into the pool

// Price by standing within position (steep at the top so elite is exclusive,
// fat middle, cheap fringe). [cumulative top fraction, price]. A player at
// percentile-from-top p gets the first band whose cutoff exceeds p.
const PRICE_BANDS: Array<[number, number]> = [
  [0.04, 10], // genuine guns only (~top 4%)
  [0.09, 9],
  [0.16, 8],
  [0.26, 7],
  [0.40, 6],
  [0.55, 5],
  [0.70, 4],
  [0.83, 3],
  [0.93, 2],
  [1.01, 1],
]

function priceForRank(rank: number, n: number): number {
  const pct = n > 0 ? rank / n : 1 // 0 = best in position
  for (const [cutoff, price] of PRICE_BANDS) if (pct < cutoff) return price
  return 1
}

// Listed AFL position → Super Sevens slot eligibility
const POSITION_MAP: Record<string, string[]> = {
  MEDIUM_DEFENDER: ['BACK'],
  KEY_DEFENDER: ['BACK'],
  MIDFIELDER: ['MID'],
  RUCK: ['RUCK'],
  MEDIUM_FORWARD: ['FWD'],
  KEY_FORWARD: ['FWD'],
  MIDFIELDER_FORWARD: ['MID', 'FWD'],
}

// Which position group a player is priced within (dual players priced as forwards)
const PRIMARY_SLOT: Record<string, string> = {
  MEDIUM_DEFENDER: 'BACK',
  KEY_DEFENDER: 'BACK',
  MIDFIELDER: 'MID',
  RUCK: 'RUCK',
  MEDIUM_FORWARD: 'FWD',
  KEY_FORWARD: 'FWD',
  MIDFIELDER_FORWARD: 'FWD',
}

export function mapPositions(listedPosition: string | null): string[] {
  return POSITION_MAP[listedPosition || ''] || []
}

function num(v: any): number {
  return v == null ? 0 : Number(v)
}

export interface SevensRound {
  id: number
  round: number
  budget: number
  status: 'open' | 'locked' | 'scored'
  locksAt: string | null
}

export interface PoolPlayer {
  playerId: string
  playerName: string
  team: string
  positions: string[]
  avgPoints: number   // season average (sets the price)
  price: number
  last5: number[]     // most recent 5 fantasy scores, oldest→newest (form, display only)
  last5Avg: number    // average of those 5
}

export class SevensModel {
  /**
   * Resolve the active Super Sevens round (the nearest upcoming AFL round),
   * creating it and pricing its player pool on first touch. Status reflects
   * whether the round has locked (first bounce passed).
   */
  static async getActiveRound(seasonId: number, year: number): Promise<SevensRound | null> {
    const rounds = await SquiggleService.fetchAllUpcomingRounds(year)
    if (rounds.length === 0) {
      // No upcoming games — fall back to the latest existing sevens round
      const existing = await db.query(
        `SELECT id, round, budget, status, locks_at as "locksAt" FROM sevens_rounds
         WHERE season_id = $1 ORDER BY round DESC LIMIT 1`,
        [seasonId]
      )
      return existing.rows[0] ? this.withLiveStatus(existing.rows[0]) : null
    }

    const nearest = rounds[0]
    const locksAt = nearest.games
      .map(g => g.date)
      .filter(Boolean)
      .sort()[0] || null

    // Upsert the round
    const result = await db.query(
      `INSERT INTO sevens_rounds (season_id, round, budget, locks_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (season_id, round) DO UPDATE SET locks_at = COALESCE(sevens_rounds.locks_at, EXCLUDED.locks_at)
       RETURNING id, round, budget, status, locks_at as "locksAt"`,
      [seasonId, nearest.round, DEFAULT_BUDGET, locksAt]
    )
    const round = result.rows[0]

    // Price the pool if it's empty
    const poolCount = await db.query(`SELECT COUNT(*)::int as c FROM sevens_player_pool WHERE sevens_round_id = $1`, [round.id])
    if (poolCount.rows[0].c === 0) {
      await this.generatePool(round.id, year)
    }

    return this.withLiveStatus(round)
  }

  /** Derive open/locked from locks_at (stored status only advances to 'scored'). */
  private static withLiveStatus(round: any): SevensRound {
    const stored = round.status as SevensRound['status']
    if (stored === 'scored') return { ...round, budget: num(round.budget) }
    const locked = round.locksAt ? new Date(round.locksAt).getTime() <= Date.now() : false
    return { ...round, budget: num(round.budget), status: locked ? 'locked' : 'open' }
  }

  /**
   * Build the priced player pool. Within each position, players are ranked by
   * fantasy average and priced on a steep 1–10 curve: only the top ~4% are Ƒ10,
   * so the elite are exclusive and there's gradation among the guns rather than
   * a flat top bucket. Pricing is per-position, so positional scarcity is built
   * in (the best ruck and best forward are both Ƒ10 despite different output).
   */
  static async generatePool(sevensRoundId: number, year: number): Promise<number> {
    const rows = await db.query(
      `SELECT d.player_id as "playerId", d.player_name as "playerName", d.team_internal as "team",
              d.listed_position as "listedPosition",
              ROUND(AVG(s.dream_team_points), 1)::float as "avgPoints",
              COUNT(*)::int as games
       FROM multi_players d
       JOIN multi_player_stats s ON s.player_id = d.player_id AND s.season_year = $1
       WHERE d.listed_position IS NOT NULL
       GROUP BY d.player_id, d.player_name, d.team_internal, d.listed_position
       HAVING COUNT(*) >= $2`,
      [year, MIN_GAMES]
    )

    // Group eligible players by their pricing position
    type Row = { playerId: string; playerName: string; team: string; listedPosition: string; avgPoints: number; positions: string[] }
    const byGroup: Record<string, Row[]> = {}
    for (const r of rows.rows) {
      const positions = mapPositions(r.listedPosition)
      if (positions.length === 0) continue
      const group = PRIMARY_SLOT[r.listedPosition]
      if (!group) continue
      ;(byGroup[group] ||= []).push({
        playerId: r.playerId, playerName: r.playerName, team: r.team,
        listedPosition: r.listedPosition, avgPoints: num(r.avgPoints), positions,
      })
    }

    let inserted = 0
    for (const group of Object.keys(byGroup)) {
      const players = byGroup[group].sort((a, b) => b.avgPoints - a.avgPoints)
      const n = players.length
      for (let rank = 0; rank < n; rank++) {
        const tier = priceForRank(rank, n) // steep 1–10 curve, exclusive at the top
        const p = players[rank]
        await db.query(
          `INSERT INTO sevens_player_pool (sevens_round_id, player_id, player_name, team_internal, positions, avg_points, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (sevens_round_id, player_id) DO NOTHING`,
          [sevensRoundId, p.playerId, p.playerName, p.team, p.positions, p.avgPoints, tier]
        )
        inserted++
      }
    }
    return inserted
  }

  static async getPool(sevensRoundId: number, year: number): Promise<PoolPlayer[]> {
    // Form (last 5 scores) computed fresh so it tracks the live season,
    // even though the price was snapshotted from the season average.
    const result = await db.query(
      `SELECT pp.player_id as "playerId", pp.player_name as "playerName", pp.team_internal as "team",
              pp.positions, pp.avg_points as "avgPoints", pp.price,
              COALESCE(f.last5, '{}') as "last5", f.last5avg as "last5Avg"
       FROM sevens_player_pool pp
       LEFT JOIN LATERAL (
         SELECT array_agg(pts ORDER BY round ASC) as last5, ROUND(AVG(pts), 1) as last5avg
         FROM (
           SELECT dream_team_points pts, round FROM multi_player_stats
           WHERE player_id = pp.player_id AND season_year = $2
           ORDER BY round DESC LIMIT 5
         ) recent
       ) f ON true
       WHERE pp.sevens_round_id = $1
       ORDER BY pp.price DESC, pp.player_name ASC`,
      [sevensRoundId, year]
    )
    return result.rows.map((r: any) => ({
      ...r,
      avgPoints: num(r.avgPoints),
      price: num(r.price),
      last5: (r.last5 || []).map((v: any) => Math.round(num(v))),
      last5Avg: r.last5Avg == null ? num(r.avgPoints) : num(r.last5Avg),
    }))
  }

  /**
   * Save (or replace) the user's team for the active round. Every rule is
   * enforced server-side — the client is never trusted for prices, eligibility,
   * formation, budget or the lock.
   */
  static async saveTeam(
    userId: number,
    seasonId: number,
    year: number,
    picks: Array<{ playerId: string; slot: string }>
  ): Promise<{ teamId: number; totalPrice: number; budget: number }> {
    const round = await this.getActiveRound(seasonId, year)
    if (!round) throw Object.assign(new Error('No active Super Sevens round'), { status: 404 })
    if (round.status !== 'open') throw Object.assign(new Error('This round has locked — teams are final'), { status: 400 })

    // Shape checks
    if (!Array.isArray(picks) || picks.length !== TEAM_SIZE) {
      throw Object.assign(new Error(`Pick exactly ${TEAM_SIZE} players`), { status: 400 })
    }
    const playerIds = picks.map(p => p.playerId)
    if (new Set(playerIds).size !== playerIds.length) {
      throw Object.assign(new Error('A player can only be picked once'), { status: 400 })
    }
    // Exact formation
    const slotCounts: Record<string, number> = {}
    for (const p of picks) slotCounts[p.slot] = (slotCounts[p.slot] || 0) + 1
    for (const [slot, need] of Object.entries(FORMATION)) {
      if ((slotCounts[slot] || 0) !== need) {
        throw Object.assign(new Error(`Need exactly ${need} ${slot} — you have ${slotCounts[slot] || 0}`), { status: 400 })
      }
    }
    for (const slot of Object.keys(slotCounts)) {
      if (!(slot in FORMATION)) throw Object.assign(new Error(`Unknown slot ${slot}`), { status: 400 })
    }

    // Validate every pick against the round's priced pool
    const poolRows = await db.query(
      `SELECT player_id as "playerId", player_name as "playerName", positions, price
       FROM sevens_player_pool WHERE sevens_round_id = $1 AND player_id = ANY($2::varchar[])`,
      [round.id, playerIds]
    )
    const poolById = new Map<string, { playerName: string; positions: string[]; price: number }>()
    for (const r of poolRows.rows) poolById.set(r.playerId, { playerName: r.playerName, positions: r.positions, price: num(r.price) })

    let totalPrice = 0
    const resolved = picks.map(p => {
      const pool = poolById.get(p.playerId)
      if (!pool) throw Object.assign(new Error(`Player ${p.playerId} is not in this round's pool`), { status: 400 })
      if (!pool.positions.includes(p.slot)) {
        throw Object.assign(new Error(`${pool.playerName} can't play ${p.slot}`), { status: 400 })
      }
      totalPrice += pool.price
      return { playerId: p.playerId, slot: p.slot, price: pool.price }
    })

    if (totalPrice > round.budget) {
      throw Object.assign(new Error(`Over budget by ${totalPrice - round.budget} — cap is ${round.budget}`), { status: 400 })
    }

    return db.transaction(async (client) => {
      // Re-check the lock inside the transaction (guards a bounce-time race)
      const lockRow = await client.query(`SELECT status, locks_at as "locksAt" FROM sevens_rounds WHERE id = $1 FOR UPDATE`, [round.id])
      const live = lockRow.rows[0]
      const lockedNow = live.status === 'scored' || (live.locksAt && new Date(live.locksAt).getTime() <= Date.now())
      if (lockedNow) throw Object.assign(new Error('This round just locked — teams are final'), { status: 400 })

      const team = await client.query(
        `INSERT INTO sevens_teams (sevens_round_id, user_id, total_price, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (sevens_round_id, user_id)
         DO UPDATE SET total_price = $3, updated_at = NOW(), score = NULL
         RETURNING id`,
        [round.id, userId, totalPrice]
      )
      const teamId = team.rows[0].id
      await client.query(`DELETE FROM sevens_team_players WHERE team_id = $1`, [teamId])
      for (const r of resolved) {
        await client.query(
          `INSERT INTO sevens_team_players (team_id, player_id, slot, price) VALUES ($1, $2, $3, $4)`,
          [teamId, r.playerId, r.slot, r.price]
        )
      }
      return { teamId, totalPrice, budget: round.budget }
    })
  }

  static async getMyTeam(userId: number, sevensRoundId: number) {
    const team = await db.query(
      `SELECT id, total_price as "totalPrice", score FROM sevens_teams WHERE sevens_round_id = $1 AND user_id = $2`,
      [sevensRoundId, userId]
    )
    if (team.rows.length === 0) return null
    const players = await db.query(
      `SELECT tp.player_id as "playerId", tp.slot, tp.price, tp.points,
              pp.player_name as "playerName", pp.team_internal as "team", pp.avg_points as "avgPoints", pp.positions
       FROM sevens_team_players tp
       JOIN sevens_player_pool pp ON pp.sevens_round_id = $1 AND pp.player_id = tp.player_id
       WHERE tp.team_id = $2`,
      [sevensRoundId, team.rows[0].id]
    )
    return {
      teamId: team.rows[0].id,
      totalPrice: num(team.rows[0].totalPrice),
      score: team.rows[0].score == null ? null : num(team.rows[0].score),
      players: players.rows.map((r: any) => ({ ...r, price: num(r.price), avgPoints: num(r.avgPoints), points: r.points == null ? null : num(r.points) })),
    }
  }

  /**
   * Score any locked-but-unscored rounds whose games are complete: sum each
   * team's players' actual fantasy points (a player who didn't play scores 0).
   */
  static async scoreRounds(seasonId: number, year: number): Promise<number> {
    const open = await db.query(
      `SELECT id, round FROM sevens_rounds WHERE season_id = $1 AND status != 'scored'`,
      [seasonId]
    )
    if (open.rows.length === 0) return 0

    const upcoming = await SquiggleService.fetchAllUpcomingRounds(year)
    const roundsStillGoing = new Set(upcoming.map(r => r.round))

    let scored = 0
    for (const sr of open.rows) {
      if (roundsStillGoing.has(sr.round)) continue // round not finished

      // Actual fantasy points for that round; require stats to be ingested
      const stats = await db.query(
        `SELECT player_id as "playerId", dream_team_points as "points"
         FROM multi_player_stats WHERE season_year = $1 AND round = $2`,
        [year, sr.round]
      )
      if (stats.rows.length === 0) continue
      const pointsByPlayer = new Map<string, number>()
      for (const r of stats.rows) pointsByPlayer.set(r.playerId, num(r.points))

      await db.transaction(async (client) => {
        const teams = await client.query(`SELECT id FROM sevens_teams WHERE sevens_round_id = $1`, [sr.id])
        for (const t of teams.rows) {
          const tps = await client.query(`SELECT id, player_id as "playerId" FROM sevens_team_players WHERE team_id = $1`, [t.id])
          let teamScore = 0
          for (const tp of tps.rows) {
            const pts = pointsByPlayer.get(tp.playerId) ?? 0 // late out / didn't play = 0
            teamScore += pts
            await client.query(`UPDATE sevens_team_players SET points = $1 WHERE id = $2`, [pts, tp.id])
          }
          await client.query(`UPDATE sevens_teams SET score = $1 WHERE id = $2`, [Math.round(teamScore * 10) / 10, t.id])
        }
        await client.query(`UPDATE sevens_rounds SET status = 'scored' WHERE id = $1`, [sr.id])
      })
      scored++
    }
    return scored
  }

  static async getLeaderboard(sevensRoundId: number) {
    const result = await db.query(
      `SELECT t.user_id as "userId", u.display_name as "displayName", t.total_price as "totalPrice", t.score
       FROM sevens_teams t JOIN users u ON u.id = t.user_id
       WHERE t.sevens_round_id = $1
       ORDER BY t.score DESC NULLS LAST, t.total_price ASC`,
      [sevensRoundId]
    )
    return result.rows.map((r: any) => ({ ...r, totalPrice: num(r.totalPrice), score: r.score == null ? null : num(r.score) }))
  }
}
