import { db } from '../db'

export interface Season {
  id: number
  year: number
  startDate: Date
  cutoffDate: Date
  status: 'open' | 'locked' | 'completed'
}

export class SeasonModel {
  /**
   * Returns the most recent active season (open or locked).
   * 'locked' means predictions are closed but the season is still in progress.
   * 'completed' seasons are excluded — use getAllSeasons for historical data.
   */
  static async getCurrentSeason(): Promise<Season | null> {
    const result = await db.query(
      `SELECT id, year, start_date as "startDate", cutoff_date as "cutoffDate", status
       FROM seasons
       WHERE status IN ('open', 'locked')
       ORDER BY year DESC
       LIMIT 1`
    )
    return result.rows[0] || null
  }

  static async getSeasonById(seasonId: number): Promise<Season | null> {
    const result = await db.query(
      `SELECT id, year, start_date as "startDate", cutoff_date as "cutoffDate", status
       FROM seasons WHERE id = $1`,
      [seasonId]
    )
    return result.rows[0] || null
  }

  static async isAfterCutoff(seasonId: number): Promise<boolean> {
    const result = await db.query(
      `SELECT NOW() > cutoff_date as "isAfter" FROM seasons WHERE id = $1`,
      [seasonId]
    )
    return result.rows[0]?.isAfter || false
  }

  static async getAllSeasons(): Promise<Season[]> {
    const result = await db.query(
      `SELECT id, year, start_date as "startDate", cutoff_date as "cutoffDate", status
       FROM seasons
       ORDER BY year DESC`
    )
    return result.rows
  }

  static async updateCutoffDate(seasonId: number, cutoffDate: string): Promise<Season | null> {
    const result = await db.query(
      `UPDATE seasons
       SET cutoff_date = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, year, start_date as "startDate", cutoff_date as "cutoffDate", status`,
      [cutoffDate, seasonId]
    )
    return result.rows[0] || null
  }
}
