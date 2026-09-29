import { db } from '../db'
import { FantasyRoundStatus } from './fantasyTypes'

export interface FantasyRound {
  id: number
  seasonId: number
  roundNo: number
  status: FantasyRoundStatus
  startsAt: Date
  endsAt: Date
  createdAt: Date
  updatedAt: Date
}

export class FantasyRoundModel {
  static async findById(roundId: number): Promise<FantasyRound | null> {
    const result = await db.query(
      `SELECT id, season_id as "seasonId", round_no as "roundNo", status,
              starts_at as "startsAt", ends_at as "endsAt",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM fantasy_rounds
       WHERE id = $1`,
      [roundId]
    )
    return result.rows[0] || null
  }

  static async findBySeasonAndRoundNo(seasonId: number, roundNo: number): Promise<FantasyRound | null> {
    const result = await db.query(
      `SELECT id, season_id as "seasonId", round_no as "roundNo", status,
              starts_at as "startsAt", ends_at as "endsAt",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM fantasy_rounds
       WHERE season_id = $1 AND round_no = $2`,
      [seasonId, roundNo]
    )
    return result.rows[0] || null
  }

  static async upsertRound(
    seasonId: number,
    roundNo: number,
    startsAt: Date,
    endsAt: Date,
    status: FantasyRoundStatus = 'open'
  ): Promise<FantasyRound> {
    const result = await db.query(
      `INSERT INTO fantasy_rounds (season_id, round_no, starts_at, ends_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (season_id, round_no)
       DO UPDATE SET starts_at = $3, ends_at = $4, status = $5, updated_at = NOW()
       RETURNING id, season_id as "seasonId", round_no as "roundNo", status,
                 starts_at as "startsAt", ends_at as "endsAt",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [seasonId, roundNo, startsAt, endsAt, status]
    )
    return result.rows[0]
  }

  static async getCurrentByCompetitionId(competitionId: number): Promise<FantasyRound | null> {
    const result = await db.query(
      `SELECT r.id, r.season_id as "seasonId", r.round_no as "roundNo", r.status,
              r.starts_at as "startsAt", r.ends_at as "endsAt",
              r.created_at as "createdAt", r.updated_at as "updatedAt"
       FROM fantasy_rounds r
       JOIN fantasy_competitions c
         ON c.season_id = r.season_id
       WHERE c.id = $1
         AND r.round_no BETWEEN c.start_round AND c.end_round
         AND NOW() <= r.ends_at
       ORDER BY
         CASE
           WHEN NOW() BETWEEN r.starts_at AND r.ends_at THEN 0
           WHEN NOW() < r.starts_at THEN 1
           ELSE 2
         END,
         r.starts_at ASC
       LIMIT 1`,
      [competitionId]
    )
    return result.rows[0] || null
  }

  static async listByCompetitionId(competitionId: number): Promise<FantasyRound[]> {
    const result = await db.query(
      `SELECT r.id, r.season_id as "seasonId", r.round_no as "roundNo", r.status,
              r.starts_at as "startsAt", r.ends_at as "endsAt",
              r.created_at as "createdAt", r.updated_at as "updatedAt"
       FROM fantasy_rounds r
       JOIN fantasy_competitions c
         ON c.season_id = r.season_id
       WHERE c.id = $1
         AND r.round_no BETWEEN c.start_round AND c.end_round
       ORDER BY r.round_no ASC`,
      [competitionId]
    )
    return result.rows
  }
}
