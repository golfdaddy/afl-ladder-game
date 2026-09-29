import { PoolClient } from 'pg'
import { db } from '../db'
import { FantasyPosition } from './fantasyTypes'

export interface FantasyPlayer {
  id: number
  externalId: string
  fullName: string
  aflTeam: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface FantasyRoundPlayerView {
  playerId: number
  externalId: string
  fullName: string
  aflTeam: string
  avgScore: number
  priceBucket: number
  lockAt: Date
  isAvailable: boolean
  positions: FantasyPosition[]
  fantasyPoints: number | null
  scoreFinal: boolean
}

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>
}

export class FantasyPlayerModel {
  static async upsertPlayer(
    externalId: string,
    fullName: string,
    aflTeam: string,
    active: boolean = true,
    client?: Queryable
  ): Promise<FantasyPlayer> {
    const conn = client ?? db
    const result = await conn.query(
      `INSERT INTO fantasy_players (external_id, full_name, afl_team, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (external_id)
       DO UPDATE SET full_name = $2, afl_team = $3, active = $4, updated_at = NOW()
       RETURNING id, external_id as "externalId", full_name as "fullName",
                 afl_team as "aflTeam", active, created_at as "createdAt", updated_at as "updatedAt"`,
      [externalId, fullName, aflTeam, active]
    )
    return result.rows[0]
  }

  static async replaceEligibility(
    playerId: number,
    positions: FantasyPosition[],
    client?: Queryable
  ): Promise<void> {
    const conn = client ?? db
    await conn.query(
      `DELETE FROM fantasy_player_eligibility WHERE player_id = $1`,
      [playerId]
    )

    for (const position of positions) {
      await conn.query(
        `INSERT INTO fantasy_player_eligibility (player_id, position, created_at)
         VALUES ($1, $2, NOW())`,
        [playerId, position]
      )
    }
  }

  static async upsertRoundPlayer(
    roundId: number,
    playerId: number,
    avgScore: number,
    priceBucket: number,
    lockAt: Date,
    isAvailable: boolean = true,
    client?: Queryable
  ): Promise<void> {
    const conn = client ?? db
    await conn.query(
      `INSERT INTO fantasy_round_players
         (round_id, player_id, avg_score, price_bucket, lock_at, is_available, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (round_id, player_id)
       DO UPDATE SET avg_score = $3, price_bucket = $4, lock_at = $5,
                     is_available = $6, updated_at = NOW()`,
      [roundId, playerId, avgScore, priceBucket, lockAt, isAvailable]
    )
  }

  static async setRoundPlayerScore(
    roundId: number,
    playerId: number,
    fantasyPoints: number,
    sourceUpdatedAt: Date,
    isFinal: boolean,
    client?: Queryable
  ): Promise<void> {
    const conn = client ?? db
    await conn.query(
      `INSERT INTO fantasy_round_player_scores
         (round_id, player_id, fantasy_points, source_updated_at, is_final, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (round_id, player_id)
       DO UPDATE SET fantasy_points = $3, source_updated_at = $4, is_final = $5, updated_at = NOW()`,
      [roundId, playerId, fantasyPoints, sourceUpdatedAt, isFinal]
    )
  }

  static async listRoundPlayers(roundId: number): Promise<FantasyRoundPlayerView[]> {
    const result = await db.query(
      `SELECT rp.player_id as "playerId", p.external_id as "externalId", p.full_name as "fullName",
              p.afl_team as "aflTeam", rp.avg_score as "avgScore", rp.price_bucket as "priceBucket",
              rp.lock_at as "lockAt", rp.is_available as "isAvailable",
              COALESCE(
                ARRAY_AGG(pe.position ORDER BY pe.position) FILTER (WHERE pe.position IS NOT NULL),
                ARRAY[]::VARCHAR[]
              ) as positions,
              s.fantasy_points as "fantasyPoints",
              COALESCE(s.is_final, false) as "scoreFinal"
       FROM fantasy_round_players rp
       JOIN fantasy_players p ON p.id = rp.player_id
       LEFT JOIN fantasy_player_eligibility pe ON pe.player_id = p.id
       LEFT JOIN fantasy_round_player_scores s ON s.round_id = rp.round_id AND s.player_id = rp.player_id
       WHERE rp.round_id = $1
       GROUP BY rp.player_id, p.external_id, p.full_name, p.afl_team, rp.avg_score,
                rp.price_bucket, rp.lock_at, rp.is_available, s.fantasy_points, s.is_final
       ORDER BY rp.price_bucket DESC, p.full_name ASC`,
      [roundId]
    )

    return result.rows.map((row: any) => ({
      ...row,
      avgScore: Number(row.avgScore),
      priceBucket: Number(row.priceBucket),
      fantasyPoints: row.fantasyPoints === null ? null : Number(row.fantasyPoints),
    }))
  }

  static async getRoundPlayer(roundId: number, playerId: number): Promise<FantasyRoundPlayerView | null> {
    const players = await this.listRoundPlayers(roundId)
    return players.find((p) => p.playerId === playerId) || null
  }

  static async getRecentCompletedScores(
    playerId: number,
    seasonId: number,
    beforeRoundNo: number,
    limit: number = 3
  ): Promise<number[]> {
    const result = await db.query(
      `SELECT s.fantasy_points as "fantasyPoints"
       FROM fantasy_round_player_scores s
       JOIN fantasy_rounds r ON r.id = s.round_id
       WHERE s.player_id = $1
         AND r.season_id = $2
         AND r.round_no < $3
       ORDER BY r.round_no DESC
       LIMIT $4`,
      [playerId, seasonId, beforeRoundNo, limit]
    )
    return result.rows.map((r: any) => Number(r.fantasyPoints))
  }
}
