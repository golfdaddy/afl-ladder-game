import { db } from '../db'
import { FantasyLeaderboardEntry } from './fantasyTypes'

export interface FantasyRoundRanking {
  id: number
  competitionId: number
  roundId: number
  userId: number
  lineupId: number
  points: number
  salaryUsed: number
  submittedAt: Date
  rank: number
}

export class FantasyRankingModel {
  static async replaceRoundRankings(
    competitionId: number,
    roundId: number,
    rankings: Array<{
      userId: number
      lineupId: number
      points: number
      salaryUsed: number
      submittedAt: Date
      rank: number
    }>
  ): Promise<void> {
    await db.transaction(async (client) => {
      await client.query(
        `DELETE FROM fantasy_round_rankings
         WHERE competition_id = $1 AND round_id = $2`,
        [competitionId, roundId]
      )

      for (const row of rankings) {
        await client.query(
          `INSERT INTO fantasy_round_rankings
             (competition_id, round_id, user_id, lineup_id, points, salary_used, submitted_at, rank, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [
            competitionId,
            roundId,
            row.userId,
            row.lineupId,
            row.points,
            row.salaryUsed,
            row.submittedAt,
            row.rank,
          ]
        )
      }
    })
  }

  static async getWeeklyLeaderboard(competitionId: number, roundId: number): Promise<FantasyLeaderboardEntry[]> {
    const result = await db.query(
      `SELECT r.user_id as "userId", u.display_name as "displayName",
              r.points, r.salary_used as "salaryUsed", r.submitted_at as "submittedAt", r.rank
       FROM fantasy_round_rankings r
       JOIN users u ON u.id = r.user_id
       WHERE r.competition_id = $1 AND r.round_id = $2
       ORDER BY r.rank ASC`,
      [competitionId, roundId]
    )
    return result.rows.map((row: any) => ({
      ...row,
      points: Number(row.points),
      salaryUsed: Number(row.salaryUsed),
      rank: Number(row.rank),
    }))
  }

  static async getSeasonLeaderboard(competitionId: number): Promise<FantasyLeaderboardEntry[]> {
    const result = await db.query(
      `SELECT u.id as "userId", u.display_name as "displayName",
              SUM(r.points)::DECIMAL(10, 2) as points,
              SUM(r.salary_used)::int as "salaryUsed",
              MIN(r.submitted_at) as "submittedAt",
              RANK() OVER (
                ORDER BY SUM(r.points) DESC, SUM(r.salary_used) ASC, MIN(r.submitted_at) ASC
              )::int as rank
       FROM fantasy_round_rankings r
       JOIN users u ON u.id = r.user_id
       WHERE r.competition_id = $1
       GROUP BY u.id, u.display_name
       ORDER BY rank ASC`,
      [competitionId]
    )
    return result.rows.map((row: any) => ({
      ...row,
      points: Number(row.points),
      salaryUsed: Number(row.salaryUsed),
      rank: Number(row.rank),
    }))
  }
}
