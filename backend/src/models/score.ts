import { db } from '../db'
import { PredictionModel } from './prediction'
import { AFLLadderModel, AFLTeam } from './aflLadder'

export interface Score {
  id: number
  competitionId: number
  userId: number
  seasonId: number
  totalPoints: number
  updatedAt: Date
}

export interface PointDetail {
  teamName: string
  predictedPosition: number | null
  actualPosition: number | null
  pointsForTeam: number | null
}

export class ScoreModel {
  static async calculateAndUpdateScores(seasonId: number, competitionId?: number): Promise<void> {
    return db.transaction(async (client) => {
      // Get latest ladder
      const ladder = await AFLLadderModel.getLatestLadder(seasonId)
      if (!ladder) {
        throw new Error('No AFL ladder found for season')
      }

      // Create map of team names to actual positions
      const actualPositions: { [teamName: string]: number } = {}
      for (const team of ladder.teams) {
        actualPositions[team.teamName] = team.position
      }

      // Get competitions for this season
      let competitionIds: number[] = []
      if (competitionId) {
        competitionIds = [competitionId]
      } else {
        const result = await client.query(
          `SELECT id FROM competitions WHERE season_id = $1`,
          [seasonId]
        )
        competitionIds = result.rows.map((r: any) => r.id)
      }

      // For each competition, get members and calculate scores
      for (const compId of competitionIds) {
        const membersResult = await client.query(
          `SELECT user_id FROM competition_members WHERE competition_id = $1`,
          [compId]
        )

        for (const memberRow of membersResult.rows) {
          const userId = memberRow.user_id

          // Get user's prediction
          const prediction = await PredictionModel.findByUserAndSeason(userId, seasonId)
          if (!prediction) {
            continue
          }

          // Calculate total points
          let totalPoints = 0
          const pointDetails: PointDetail[] = []

          for (const predictedTeam of prediction.teams) {
            const actualPos = actualPositions[predictedTeam.teamName]
            if (actualPos !== undefined) {
              const points = Math.abs(predictedTeam.position - actualPos)
              totalPoints += points

              pointDetails.push({
                teamName: predictedTeam.teamName,
                predictedPosition: predictedTeam.position,
                actualPosition: actualPos,
                pointsForTeam: points
              })
            } else {
              // Team not found in ladder
              pointDetails.push({
                teamName: predictedTeam.teamName,
                predictedPosition: predictedTeam.position,
                actualPosition: null,
                pointsForTeam: null
              })
            }
          }

          // Upsert score
          const scoreResult = await client.query(
            `INSERT INTO scores (competition_id, user_id, season_id, total_points, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (competition_id, user_id, season_id)
             DO UPDATE SET total_points = $4, updated_at = NOW()
             RETURNING id`,
            [compId, userId, seasonId, totalPoints]
          )

          const scoreId = scoreResult.rows[0].id

          // Delete old point details
          await client.query(`DELETE FROM point_details WHERE score_id = $1`, [scoreId])

          // Insert new point details
          for (const detail of pointDetails) {
            await client.query(
              `INSERT INTO point_details (score_id, team_name, predicted_position, actual_position, points_for_team, updated_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [
                scoreId,
                detail.teamName,
                detail.predictedPosition,
                detail.actualPosition,
                detail.pointsForTeam
              ]
            )
          }
        }
      }
    })
  }

  static async getCompetitionLeaderboard(
    competitionId: number
  ): Promise<(Score & { displayName: string; email: string })[]> {
    const result = await db.query(
      `SELECT s.id, s.competition_id as "competitionId", s.user_id as "userId", s.season_id as "seasonId",
              s.total_points as "totalPoints", s.updated_at as "updatedAt",
              u.display_name as "displayName", u.email
       FROM scores s
       JOIN users u ON s.user_id = u.id
       WHERE s.competition_id = $1
       ORDER BY s.total_points ASC, s.updated_at DESC`,
      [competitionId]
    )
    return result.rows
  }

  static async getUserPersonalLeaderboard(
    userId: number,
    seasonId: number
  ): Promise<(Score & { competitionName: string; displayName: string })[]> {
    const result = await db.query(
      `SELECT s.id, s.competition_id as "competitionId", s.user_id as "userId", s.season_id as "seasonId",
              s.total_points as "totalPoints", s.updated_at as "updatedAt",
              c.name as "competitionName"
       FROM scores s
       JOIN competitions c ON s.competition_id = c.id
       WHERE s.user_id = $1 AND s.season_id = $2
       ORDER BY s.total_points ASC, s.updated_at DESC`,
      [userId, seasonId]
    )
    return result.rows
  }

  static async getGlobalLeaderboard(seasonId: number, limit: number = 100): Promise<any[]> {
    // Compute each predictor's score directly from their prediction vs the actual
    // AFL ladder snapshot — this ensures users not in any competition still get a score.
    const result = await db.query(
      `WITH latest_snapshot AS (
         -- Pick the most recent ladder snapshot for this season
         SELECT id FROM afl_ladder_snapshots
         WHERE season_id = $1
         ORDER BY captured_at DESC
         LIMIT 1
       ),
       ladder_positions AS (
         -- Actual team positions from that snapshot
         SELECT lt.team_name, lt.position
         FROM afl_ladder_teams lt
         JOIN latest_snapshot ls ON lt.snapshot_id = ls.id
       ),
       user_computed_scores AS (
         -- Sum |predicted - actual| across all teams for each predictor
         SELECT
           p.user_id,
           SUM(ABS(pt.position - lp.position)) AS total_points
         FROM predictions p
         JOIN prediction_teams pt ON pt.prediction_id = p.id
         JOIN ladder_positions lp ON lp.team_name = pt.team_name
         WHERE p.season_id = $1
         GROUP BY p.user_id
       )
       SELECT
         u.id AS "userId",
         u.display_name AS "displayName",
         ucs.total_points AS "totalPoints",
         (SELECT COUNT(*) FROM competition_members cm
          JOIN competitions c ON cm.competition_id = c.id
          WHERE cm.user_id = u.id AND c.season_id = $1)::int AS "competitionCount"
       FROM predictions p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN user_computed_scores ucs ON ucs.user_id = u.id
       WHERE p.season_id = $1
         AND p.submitted_at IS NOT NULL
         AND u.is_private = false
       ORDER BY ucs.total_points ASC NULLS LAST, p.submitted_at ASC
       LIMIT $2`,
      [seasonId, limit]
    )
    return result.rows
  }

  static async getPointDetails(scoreId: number): Promise<PointDetail[]> {
    const result = await db.query(
      `SELECT team_name as "teamName", predicted_position as "predictedPosition",
              actual_position as "actualPosition", points_for_team as "pointsForTeam"
       FROM point_details
       WHERE score_id = $1
       ORDER BY predicted_position ASC`,
      [scoreId]
    )
    return result.rows
  }
}
