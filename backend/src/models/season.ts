import { db } from '../db'

export interface Season {
  id: number
  year: number
  startDate: Date
  cutoffDate: Date
  status: 'open' | 'locked' | 'completed'
}

export class SeasonModel {
  static async getCurrentSeason(): Promise<Season | null> {
    const result = await db.query(
      `SELECT id, year, start_date as "startDate", cutoff_date as "cutoffDate", status
       FROM seasons
       WHERE status = 'open'
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
}
