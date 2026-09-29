import { db } from '../db'
import { AflStatsService } from '../services/aflStats'
import { SquiggleService } from '../services/squiggle'
import { tailProbNormal, tailProbPoisson, tailProbKde, propOdds, normalizeProb } from '../utils/multiOdds'

const FORM_GAMES = 5 // games in the weighted form window, most recent weighted highest

// Pricing chips — deliberately small nudges, tune as we go
const WINPROB_GOAL_SWING = 0.4    // goals lambda scaled by 0.8 + 0.4*pWin (±20% at the extremes)
const CONCESSION_CLAMP = 0.08     // opponent-concession factor clamped to ±8%
const MOMENTUM_WEIGHT = 0.5       // how hard recent-vs-season form pulls the projection
const MOMENTUM_CLAMP = 0.12       // momentum can shift the projected mean at most ±12%
const MIN_HISTORY = 3             // games of history needed to price off the KDE

// Kernel bandwidth per stat (~0.7× typical game-to-game SD). Wider = more spread
// credited to proximity. Goals are tight (discrete, low count); disposals/hitouts
// are wide. This is where disposals and goals get genuinely different models.
const STAT_BANDWIDTH: Record<string, number> = {
  disposals: 3.0,
  goals: 0.85,
  marks: 1.5,
  tackles: 1.5,
  clearances: 1.5,
  hitouts: 4.0,
}

/** Multiplicative form nudge: recent-3 vs season, same magnitude as the mean-based momentum chip. */
function momentumFactor(recent3: number, season: number): number {
  if (season <= 0) return 1
  const trend = (recent3 - season) / season
  return 1 + Math.min(MOMENTUM_CLAMP, Math.max(-MOMENTUM_CLAMP, MOMENTUM_WEIGHT * trend))
}

/**
 * Nudge a projection toward a player's recent form. If the last 3 games run
 * hotter (or colder) than their season baseline, shift the mean part-way,
 * clamped so it stays a chip rather than a lurch.
 */
function momentumAdjust(formMean: number, recent3: number, season: number): number {
  if (season <= 0 || formMean <= 0) return formMean
  const trend = (recent3 - season) / season // +0.2 = 20% hotter lately
  const shift = Math.min(MOMENTUM_CLAMP, Math.max(-MOMENTUM_CLAMP, MOMENTUM_WEIGHT * trend))
  return formMean * (1 + shift)
}

// Sportsbet-style threshold ladders per stat
export const STAT_LADDERS: Record<string, number[]> = {
  disposals: [15, 20, 25, 30, 35],
  goals: [1, 2, 3, 4, 5],
  marks: [4, 6, 8, 10],
  tackles: [4, 6, 8],
  clearances: [4, 6, 8, 10],
  hitouts: [20, 30, 40],
}

export const STAT_LABELS: Record<string, string> = {
  disposals: 'Disposals',
  goals: 'Goals',
  marks: 'Marks',
  tackles: 'Tackles',
  clearances: 'Clearances',
  hitouts: 'Hitouts',
}

export interface PlayerMarketRung {
  stat: string
  threshold: number
  odds: number
  prob: number
}

export interface PlayerPropMarket {
  playerId: string
  playerName: string
  team: string
  listedPosition: string | null
  avgs: Record<string, number>
  rungs: PlayerMarketRung[]
}

export interface GameProps {
  gameId: number
  providerMatchId: string
  homeTeam: string
  awayTeam: string
  players: PlayerPropMarket[]
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

interface ConcessionFactors {
  [teamInternal: string]: Record<string, number>
}

let concessionCache: { year: number; fetchedAt: number; factors: ConcessionFactors } | null = null

export class MultiPropsModel {
  /**
   * Per-team defensive concession factors: how much of each stat a team
   * gives up per match relative to the league average. >1 = leaky.
   * Cached for 6 hours — it moves slowly.
   */
  static async teamConcessionFactors(year: number): Promise<ConcessionFactors> {
    const now = Date.now()
    if (concessionCache && concessionCache.year === year && now - concessionCache.fetchedAt < 6 * 60 * 60 * 1000) {
      return concessionCache.factors
    }

    // For each match, each team "concedes" the opposing team's totals
    const result = await db.query(
      `WITH match_team_totals AS (
         SELECT provider_match_id, team_internal,
                SUM(disposals) AS disposals, SUM(goals) AS goals, SUM(marks) AS marks,
                SUM(tackles) AS tackles, SUM(clearances) AS clearances, SUM(hitouts) AS hitouts
         FROM multi_player_stats
         WHERE season_year = $1
         GROUP BY provider_match_id, team_internal
       ),
       conceded AS (
         SELECT us.team_internal,
                AVG(them.disposals)::float AS disposals, AVG(them.goals)::float AS goals,
                AVG(them.marks)::float AS marks, AVG(them.tackles)::float AS tackles,
                AVG(them.clearances)::float AS clearances, AVG(them.hitouts)::float AS hitouts
         FROM match_team_totals us
         JOIN match_team_totals them
           ON them.provider_match_id = us.provider_match_id AND them.team_internal != us.team_internal
         GROUP BY us.team_internal
       )
       SELECT * FROM conceded`,
      [year]
    )

    const stats = ['disposals', 'goals', 'marks', 'tackles', 'clearances', 'hitouts']
    const leagueAvg: Record<string, number> = {}
    for (const stat of stats) {
      const values = result.rows.map((r: any) => Number(r[stat] || 0))
      leagueAvg[stat] = values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0
    }

    const factors: ConcessionFactors = {}
    for (const row of result.rows) {
      factors[row.team_internal] = {}
      for (const stat of stats) {
        const raw = leagueAvg[stat] > 0 ? Number(row[stat]) / leagueAvg[stat] : 1
        factors[row.team_internal][stat] = Math.min(1 + CONCESSION_CLAMP, Math.max(1 - CONCESSION_CLAMP, raw))
      }
    }
    concessionCache = { year, fetchedAt: now, factors }
    return factors
  }

  /**
   * Ingest player stat lines for any concluded AFL matches we haven't stored yet.
   * Throttled — first run backfills the whole season, later runs pick up new games.
   */
  static async ingestPlayerStats(year: number): Promise<number> {
    const matches = await AflStatsService.fetchMatches(year)
    const concluded = matches.filter(m => m.status === 'CONCLUDED')
    if (concluded.length === 0) return 0

    const existing = await db.query(
      `SELECT DISTINCT provider_match_id FROM multi_player_stats WHERE season_year = $1`,
      [year]
    )
    const have = new Set(existing.rows.map((r: any) => r.provider_match_id))
    const missing = concluded.filter(m => !have.has(m.providerId))

    let ingested = 0
    for (const match of missing) {
      try {
        const stats = await AflStatsService.fetchMatchPlayerStats(match.providerId, match.homeTeam, match.awayTeam)
        if (stats.length === 0) continue
        for (const p of stats) {
          await db.query(
            `INSERT INTO multi_player_stats
               (provider_match_id, season_year, round, team_internal, player_id, player_name, disposals, goals,
                kicks, handballs, marks, tackles, hitouts, behinds, goal_assists, clearances, dream_team_points, match_position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             ON CONFLICT (provider_match_id, player_id) DO NOTHING`,
            [match.providerId, year, match.round, p.teamInternal, p.playerId, p.playerName, p.disposals, p.goals,
             p.kicks, p.handballs, p.marks, p.tackles, p.hitouts, p.behinds, p.goalAssists, p.clearances, p.dreamTeamPoints, p.matchPosition]
          )
        }
        ingested++
        await AflStatsService.pause(300)
      } catch (error: any) {
        console.error(`[Multi] Failed to ingest stats for ${match.providerId}:`, error.message)
      }
    }
    return ingested
  }

  /** Weighted recent form for every player in a team's most recent match. */
  private static async teamPlayerForm(year: number, teamInternal: string): Promise<Array<{
    playerId: string
    playerName: string
    listedPosition: string | null
    games: number
    means: Record<string, number>
    stds: Record<string, number>
    recent: Record<string, number>
    season: Record<string, number>
    gameValues: Record<string, number[]>
  }>> {
    // Roster = players who took the field in the team's most recent ingested match.
    // Weighted means (recent games heavier) + sample stddev per stat over the form window.
    const result = await db.query(
      `WITH latest AS (
         SELECT provider_match_id FROM multi_player_stats
         WHERE season_year = $1 AND team_internal = $2
         ORDER BY round DESC LIMIT 1
       ),
       roster AS (
         SELECT s.player_id, s.player_name
         FROM multi_player_stats s
         JOIN latest l ON s.provider_match_id = l.provider_match_id
         WHERE s.team_internal = $2
       ),
       recent AS (
         SELECT s.player_id, s.disposals, s.goals, s.marks, s.tackles, s.clearances, s.hitouts,
                ROW_NUMBER() OVER (PARTITION BY s.player_id ORDER BY s.round DESC) AS rn
         FROM multi_player_stats s
         JOIN roster r ON r.player_id = s.player_id
         WHERE s.season_year = $1
       )
       -- Weighted form mean over the window (recent games heavier); stddev over
       -- the window; plus a recent-3 mean and a full-season mean for momentum.
       SELECT r.player_id as "playerId", r.player_name as "playerName",
              d.listed_position as "listedPosition",
              COUNT(rec.player_id) FILTER (WHERE rec.rn <= $3)::int as games,
              SUM(rec.disposals  * ($3 + 1 - rec.rn)) FILTER (WHERE rec.rn <= $3)::float / NULLIF(SUM($3 + 1 - rec.rn) FILTER (WHERE rec.rn <= $3), 0) as "mDisposals",
              SUM(rec.goals      * ($3 + 1 - rec.rn)) FILTER (WHERE rec.rn <= $3)::float / NULLIF(SUM($3 + 1 - rec.rn) FILTER (WHERE rec.rn <= $3), 0) as "mGoals",
              SUM(rec.marks      * ($3 + 1 - rec.rn)) FILTER (WHERE rec.rn <= $3)::float / NULLIF(SUM($3 + 1 - rec.rn) FILTER (WHERE rec.rn <= $3), 0) as "mMarks",
              SUM(rec.tackles    * ($3 + 1 - rec.rn)) FILTER (WHERE rec.rn <= $3)::float / NULLIF(SUM($3 + 1 - rec.rn) FILTER (WHERE rec.rn <= $3), 0) as "mTackles",
              SUM(rec.clearances * ($3 + 1 - rec.rn)) FILTER (WHERE rec.rn <= $3)::float / NULLIF(SUM($3 + 1 - rec.rn) FILTER (WHERE rec.rn <= $3), 0) as "mClearances",
              SUM(rec.hitouts    * ($3 + 1 - rec.rn)) FILTER (WHERE rec.rn <= $3)::float / NULLIF(SUM($3 + 1 - rec.rn) FILTER (WHERE rec.rn <= $3), 0) as "mHitouts",
              COALESCE(STDDEV_SAMP(rec.disposals)  FILTER (WHERE rec.rn <= $3), 0)::float as "sDisposals",
              COALESCE(STDDEV_SAMP(rec.marks)      FILTER (WHERE rec.rn <= $3), 0)::float as "sMarks",
              COALESCE(STDDEV_SAMP(rec.tackles)    FILTER (WHERE rec.rn <= $3), 0)::float as "sTackles",
              COALESCE(STDDEV_SAMP(rec.clearances) FILTER (WHERE rec.rn <= $3), 0)::float as "sClearances",
              COALESCE(STDDEV_SAMP(rec.hitouts)    FILTER (WHERE rec.rn <= $3), 0)::float as "sHitouts",
              AVG(rec.disposals)  FILTER (WHERE rec.rn <= 3)::float as "r3Disposals",
              AVG(rec.goals)      FILTER (WHERE rec.rn <= 3)::float as "r3Goals",
              AVG(rec.marks)      FILTER (WHERE rec.rn <= 3)::float as "r3Marks",
              AVG(rec.tackles)    FILTER (WHERE rec.rn <= 3)::float as "r3Tackles",
              AVG(rec.clearances) FILTER (WHERE rec.rn <= 3)::float as "r3Clearances",
              AVG(rec.hitouts)    FILTER (WHERE rec.rn <= 3)::float as "r3Hitouts",
              AVG(rec.disposals)::float  as "snDisposals",
              AVG(rec.goals)::float      as "snGoals",
              AVG(rec.marks)::float      as "snMarks",
              AVG(rec.tackles)::float    as "snTackles",
              AVG(rec.clearances)::float as "snClearances",
              AVG(rec.hitouts)::float    as "snHitouts",
              array_agg(rec.disposals)  as "gvDisposals",
              array_agg(rec.goals)      as "gvGoals",
              array_agg(rec.marks)      as "gvMarks",
              array_agg(rec.tackles)    as "gvTackles",
              array_agg(rec.clearances) as "gvClearances",
              array_agg(rec.hitouts)    as "gvHitouts"
       FROM roster r
       LEFT JOIN multi_players d ON d.player_id = r.player_id
       JOIN recent rec ON rec.player_id = r.player_id
       GROUP BY r.player_id, r.player_name, d.listed_position
       ORDER BY "mDisposals" DESC NULLS LAST`,
      [year, teamInternal, FORM_GAMES]
    )
    return result.rows.map((r: any) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      listedPosition: r.listedPosition,
      games: r.games,
      means: {
        disposals: Number(r.mDisposals || 0),
        goals: Number(r.mGoals || 0),
        marks: Number(r.mMarks || 0),
        tackles: Number(r.mTackles || 0),
        clearances: Number(r.mClearances || 0),
        hitouts: Number(r.mHitouts || 0),
      },
      stds: {
        disposals: Number(r.sDisposals || 0),
        marks: Number(r.sMarks || 0),
        tackles: Number(r.sTackles || 0),
        clearances: Number(r.sClearances || 0),
        hitouts: Number(r.sHitouts || 0),
      },
      recent: {
        disposals: Number(r.r3Disposals ?? r.mDisposals ?? 0),
        goals: Number(r.r3Goals ?? r.mGoals ?? 0),
        marks: Number(r.r3Marks ?? r.mMarks ?? 0),
        tackles: Number(r.r3Tackles ?? r.mTackles ?? 0),
        clearances: Number(r.r3Clearances ?? r.mClearances ?? 0),
        hitouts: Number(r.r3Hitouts ?? r.mHitouts ?? 0),
      },
      season: {
        disposals: Number(r.snDisposals ?? r.mDisposals ?? 0),
        goals: Number(r.snGoals ?? r.mGoals ?? 0),
        marks: Number(r.snMarks ?? r.mMarks ?? 0),
        tackles: Number(r.snTackles ?? r.mTackles ?? 0),
        clearances: Number(r.snClearances ?? r.mClearances ?? 0),
        hitouts: Number(r.snHitouts ?? r.mHitouts ?? 0),
      },
      gameValues: {
        disposals: (r.gvDisposals ?? []).map(Number),
        goals: (r.gvGoals ?? []).map(Number),
        marks: (r.gvMarks ?? []).map(Number),
        tackles: (r.gvTackles ?? []).map(Number),
        clearances: (r.gvClearances ?? []).map(Number),
        hitouts: (r.gvHitouts ?? []).map(Number),
      },
    }))
  }

  /**
   * Build prop markets for one upcoming Squiggle game.
   * Matched to the AFL fixture by round + home team.
   */
  static async getGameProps(
    year: number,
    game: { id: number; round: number; hteamName: string; ateamName: string }
  ): Promise<GameProps | null> {
    const aflMatches = await AflStatsService.fetchMatches(year)
    const aflMatch = aflMatches.find(m =>
      m.round === game.round &&
      (m.homeTeam === game.hteamName || m.homeTeam === game.ateamName) &&
      (m.awayTeam === game.ateamName || m.awayTeam === game.hteamName)
    )
    if (!aflMatch) return null

    const [homeForm, awayForm, probs, concessions] = await Promise.all([
      this.teamPlayerForm(year, game.hteamName),
      this.teamPlayerForm(year, game.ateamName),
      SquiggleService.fetchHomeProbabilities(year),
      this.teamConcessionFactors(year),
    ])

    const pHome = normalizeProb(probs.get(game.id))

    const toMarket = (team: string, opponent: string, pWin: number) => {
      // Opponent leakiness nudges every stat; win probability nudges goals
      const oppFactors = concessions[opponent] || {}
      const goalWinFactor = 1 - WINPROB_GOAL_SWING / 2 + WINPROB_GOAL_SWING * pWin

      return (p: {
        playerId: string
        playerName: string
        listedPosition: string | null
        games: number
        means: Record<string, number>
        stds: Record<string, number>
        recent: Record<string, number>
        season: Record<string, number>
        gameValues: Record<string, number[]>
      }): PlayerPropMarket => {
        const rungs: PlayerMarketRung[] = []
        for (const [stat, ladder] of Object.entries(STAT_LADDERS)) {
          const concession = oppFactors[stat] ?? 1
          const history = p.gameValues[stat] ?? []
          // Form/matchup as a multiplicative shift on the historical distribution
          const shift = momentumFactor(p.recent[stat] ?? 0, p.season[stat] ?? 0) * concession * (stat === 'goals' ? goalWinFactor : 1)
          const bandwidth = STAT_BANDWIDTH[stat] ?? 2

          for (const threshold of ladder) {
            let prob: number
            if (history.length >= MIN_HISTORY) {
              // Kernel-density tail over actual games: proximity-aware + true spread
              prob = tailProbKde(history, threshold, bandwidth, shift)
            } else {
              // Too few games — fall back to a parametric tail on the form mean
              const mean = momentumAdjust(p.means[stat] || 0, p.recent[stat] ?? 0, p.season[stat] ?? 0) * concession * (stat === 'goals' ? goalWinFactor : 1)
              prob = stat === 'goals' ? tailProbPoisson(mean, threshold) : tailProbNormal(mean, p.stds[stat] ?? 0, threshold)
            }
            const priced = propOdds(prob)
            if (priced) rungs.push({ stat, threshold, odds: priced.odds, prob: priced.prob })
          }
        }
        const avgs: Record<string, number> = {}
        for (const stat of Object.keys(STAT_LADDERS)) avgs[stat] = round2(p.means[stat] || 0)
        return { playerId: p.playerId, playerName: p.playerName, team, listedPosition: p.listedPosition, avgs, rungs }
      }
    }

    const players = [
      ...homeForm.map(toMarket(game.hteamName, game.ateamName, pHome)),
      ...awayForm.map(toMarket(game.ateamName, game.hteamName, 1 - pHome)),
    ].filter(p => p.rungs.length > 0)

    return {
      gameId: game.id,
      providerMatchId: aflMatch.providerId,
      homeTeam: game.hteamName,
      awayTeam: game.ateamName,
      players,
    }
  }

  /** Refresh the player directory (identity, club, listed position, bio) from the AFL squad API. */
  static async refreshPlayerDirectory(year: number): Promise<number> {
    const teamIds = await AflStatsService.fetchTeamIds(year)
    let upserted = 0
    for (const [teamInternal, teamId] of teamIds) {
      try {
        const squad = await AflStatsService.fetchTeamSquad(year, teamId, teamInternal)
        for (const p of squad) {
          await db.query(
            `INSERT INTO multi_players (player_id, player_name, team_internal, listed_position, jumper_number, height_cm, weight_kg, date_of_birth, debut_year, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (player_id) DO UPDATE SET
               player_name = EXCLUDED.player_name,
               team_internal = EXCLUDED.team_internal,
               listed_position = EXCLUDED.listed_position,
               jumper_number = EXCLUDED.jumper_number,
               height_cm = EXCLUDED.height_cm,
               weight_kg = EXCLUDED.weight_kg,
               date_of_birth = EXCLUDED.date_of_birth,
               debut_year = EXCLUDED.debut_year,
               updated_at = NOW()`,
            [p.playerId, p.playerName, p.teamInternal, p.listedPosition, p.jumperNumber, p.heightCm, p.weightKg, p.dateOfBirth, p.debutYear]
          )
          upserted++
        }
        await AflStatsService.pause(200)
      } catch (error: any) {
        console.error(`[Multi] Failed to refresh squad for ${teamInternal}:`, error.message)
      }
    }
    return upserted
  }

  /** Season averages across every captured stat, joined with the directory. */
  static async getPlayerDirectory(year: number, teamInternal?: string) {
    const result = await db.query(
      `SELECT
         d.player_id as "playerId",
         d.player_name as "playerName",
         d.team_internal as "team",
         d.listed_position as "listedPosition",
         d.jumper_number as "jumperNumber",
         d.height_cm as "heightCm",
         d.weight_kg as "weightKg",
         d.date_of_birth as "dateOfBirth",
         d.debut_year as "debutYear",
         COUNT(s.id)::int as games,
         ROUND(AVG(s.disposals), 1)::float as "avgDisposals",
         ROUND(AVG(s.kicks), 1)::float as "avgKicks",
         ROUND(AVG(s.handballs), 1)::float as "avgHandballs",
         ROUND(AVG(s.marks), 1)::float as "avgMarks",
         ROUND(AVG(s.tackles), 1)::float as "avgTackles",
         ROUND(AVG(s.hitouts), 1)::float as "avgHitouts",
         ROUND(AVG(s.goals), 2)::float as "avgGoals",
         ROUND(AVG(s.behinds), 2)::float as "avgBehinds",
         ROUND(AVG(s.goal_assists), 2)::float as "avgGoalAssists",
         ROUND(AVG(s.clearances), 1)::float as "avgClearances",
         ROUND(AVG(s.dream_team_points), 1)::float as "avgFantasyPoints"
       FROM multi_players d
       LEFT JOIN multi_player_stats s ON s.player_id = d.player_id AND s.season_year = $1
       WHERE ($2::varchar IS NULL OR d.team_internal = $2)
       GROUP BY d.player_id
       ORDER BY d.team_internal, "avgDisposals" DESC NULLS LAST`,
      [year, teamInternal || null]
    )
    return result.rows
  }

  /**
   * Compute and persist the odds board for every game in the nearest upcoming
   * round. The saved board is the queryable record of "what we'd offer now".
   */
  static async saveOddsBoard(year: number): Promise<number> {
    const rounds = await SquiggleService.fetchAllUpcomingRounds(year)
    if (rounds.length === 0) return 0
    const nearest = rounds[0]

    let saved = 0
    for (const game of nearest.games) {
      const props = await this.getGameProps(year, { id: game.id, round: game.round, hteamName: game.hteamName, ateamName: game.ateamName })
      if (!props) continue
      for (const player of props.players) {
        for (const rung of player.rungs) {
          await db.query(
            `INSERT INTO multi_player_odds
               (provider_match_id, game_id, season_year, round, player_id, player_name, team_internal, stat, threshold, odds, implied_prob, computed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             ON CONFLICT (provider_match_id, player_id, stat, threshold)
             DO UPDATE SET odds = EXCLUDED.odds, implied_prob = EXCLUDED.implied_prob, computed_at = NOW()`,
            [props.providerMatchId, game.id, year, game.round, player.playerId, player.playerName, player.team, rung.stat, rung.threshold, rung.odds, rung.prob]
          )
          saved++
        }
      }
    }
    return saved
  }

  /** Convenience: props for a Squiggle game id. */
  static async getGamePropsById(year: number, gameId: number): Promise<GameProps | null> {
    const rounds = await SquiggleService.fetchAllUpcomingRounds(year)
    for (const r of rounds) {
      const game = r.games.find(g => g.id === gameId)
      if (game) return this.getGameProps(year, { id: game.id, round: game.round, hteamName: game.hteamName, ateamName: game.ateamName })
    }
    return null
  }
}
