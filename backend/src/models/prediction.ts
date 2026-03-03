import { db } from '../db'

export interface PredictedTeam {
  position: number
  teamName: string
}

export interface Prediction {
  id: number
  userId: number
  seasonId: number
  teams: PredictedTeam[]
  submittedAt: Date
  updatedAt: Date
}

export class PredictionModel {
  static async create(userId: number, seasonId: number, teams: PredictedTeam[]): Promise<Prediction> {
    return db.transaction(async (client) => {
      // Insert prediction
      const predResult = await client.query(
        `INSERT INTO predictions (user_id, season_id, submitted_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id, user_id as "userId", season_id as "seasonId", submitted_at as "submittedAt", updated_at as "updatedAt"`,
        [userId, seasonId]
      )

      const predictionId = predResult.rows[0].id

      // Insert teams
      for (const team of teams) {
        await client.query(
          `INSERT INTO predicted_teams (prediction_id, position, team_name)
           VALUES ($1, $2, $3)`,
          [predictionId, team.position, team.teamName]
        )
      }

      return {
        ...predResult.rows[0],
        teams
      }
    })
  }

  static async findByUserAndSeason(userId: number, seasonId: number): Promise<Prediction | null> {
    const result = await db.query(
      `SELECT p.id, p.user_id as "userId", p.season_id as "seasonId",
              p.submitted_at as "submittedAt", p.updated_at as "updatedAt"
       FROM predictions p
       WHERE p.user_id = $1 AND p.season_id = $2`,
      [userId, seasonId]
    )

    if (!result.rows[0]) return null

    const pred = result.rows[0]

    // Get teams
    const teamsResult = await db.query(
      `SELECT position, team_name as "teamName"
       FROM predicted_teams
       WHERE prediction_id = $1
       ORDER BY position ASC`,
      [pred.id]
    )

    return {
      ...pred,
      teams: teamsResult.rows
    }
  }

  static async update(predictionId: number, teams: PredictedTeam[]): Promise<Prediction> {
    return db.transaction(async (client) => {
      // Delete old teams
      await client.query(
        `DELETE FROM predicted_teams WHERE prediction_id = $1`,
        [predictionId]
      )

      // Insert new teams
      for (const team of teams) {
        await client.query(
          `INSERT INTO predicted_teams (prediction_id, position, team_name)
           VALUES ($1, $2, $3)`,
          [predictionId, team.position, team.teamName]
        )
      }

      // Update prediction timestamp
      const result = await client.query(
        `UPDATE predictions SET updated_at = NOW() WHERE id = $1
         RETURNING id, user_id as "userId", season_id as "seasonId", submitted_at as "submittedAt", updated_at as "updatedAt"`,
        [predictionId]
      )

      return {
        ...result.rows[0],
        teams
      }
    })
  }

  static async findById(predictionId: number): Promise<Prediction | null> {
    const result = await db.query(
      `SELECT id, user_id as "userId", season_id as "seasonId",
              submitted_at as "submittedAt", updated_at as "updatedAt"
       FROM predictions WHERE id = $1`,
      [predictionId]
    )

    if (!result.rows[0]) return null

    const pred = result.rows[0]

    const teamsResult = await db.query(
      `SELECT position, team_name as "teamName"
       FROM predicted_teams
       WHERE prediction_id = $1
       ORDER BY position ASC`,
      [pred.id]
    )

    return {
      ...pred,
      teams: teamsResult.rows
    }
  }
}
