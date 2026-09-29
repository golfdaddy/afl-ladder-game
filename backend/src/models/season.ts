import { db } from '../db'
import { FinalsFormat } from '../utils/finalsBracket'

export type SeasonStatus = 'open' | 'locked' | 'completed'

export interface Season {
  id: number
  year: number
  startDate: Date
  cutoffDate: Date
  grandFinalDate: Date | null
  finalsFormat: FinalsFormat
  status: SeasonStatus
  completedAt: Date | null
}

const COLS = `id, year, start_date as "startDate", cutoff_date as "cutoffDate",
              grand_final_date as "grandFinalDate", finals_format as "finalsFormat",
              status, completed_at as "completedAt"`

export class SeasonModel {
  /**
   * Returns the most recent active season (open or locked).
   * 'locked' means predictions are closed but the season is still in progress.
   * 'completed' seasons are excluded — use getAllSeasons for historical data.
   */
  static async getCurrentSeason(): Promise<Season | null> {
    const result = await db.query(
      `SELECT ${COLS} FROM seasons
       WHERE status IN ('open', 'locked')
       ORDER BY year DESC
       LIMIT 1`
    )
    return result.rows[0] || null
  }

  /** The newest season of any status — what the lifecycle job rolls forward from. */
  static async getLatestSeason(): Promise<Season | null> {
    const result = await db.query(`SELECT ${COLS} FROM seasons ORDER BY year DESC LIMIT 1`)
    return result.rows[0] || null
  }

  static async getSeasonById(seasonId: number): Promise<Season | null> {
    const result = await db.query(`SELECT ${COLS} FROM seasons WHERE id = $1`, [seasonId])
    return result.rows[0] || null
  }

  static async getSeasonByYear(year: number): Promise<Season | null> {
    const result = await db.query(`SELECT ${COLS} FROM seasons WHERE year = $1`, [year])
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
    const result = await db.query(`SELECT ${COLS} FROM seasons ORDER BY year DESC`)
    return result.rows
  }

  static async createSeason(input: {
    year: number
    startDate: string
    cutoffDate: string
    grandFinalDate?: string | null
    finalsFormat?: FinalsFormat
  }): Promise<Season | null> {
    const result = await db.query(
      `INSERT INTO seasons (year, start_date, cutoff_date, grand_final_date, finals_format, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       ON CONFLICT (year) DO NOTHING
       RETURNING ${COLS}`,
      [input.year, input.startDate, input.cutoffDate, input.grandFinalDate ?? null, input.finalsFormat ?? 'wildcard10']
    )
    return result.rows[0] || null
  }

  static async setStatus(seasonId: number, status: SeasonStatus): Promise<Season | null> {
    const result = await db.query(
      `UPDATE seasons
       SET status = $1,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING ${COLS}`,
      [status, seasonId]
    )
    return result.rows[0] || null
  }

  static async updateCutoffDate(seasonId: number, cutoffDate: string): Promise<Season | null> {
    return SeasonModel.updateSettings(seasonId, { cutoffDate })
  }

  /** Update any of the season's dates/format; undefined fields are left as-is. */
  static async updateSettings(
    seasonId: number,
    input: { startDate?: string; cutoffDate?: string; grandFinalDate?: string | null; finalsFormat?: FinalsFormat }
  ): Promise<Season | null> {
    const result = await db.query(
      `UPDATE seasons
       SET start_date       = COALESCE($1, start_date),
           cutoff_date      = COALESCE($2, cutoff_date),
           grand_final_date = CASE WHEN $6 THEN $3 ELSE grand_final_date END,
           finals_format    = COALESCE($4, finals_format),
           updated_at       = NOW()
       WHERE id = $5
       RETURNING ${COLS}`,
      [
        input.startDate ?? null,
        input.cutoffDate ?? null,
        input.grandFinalDate ?? null,
        input.finalsFormat ?? null,
        seasonId,
        input.grandFinalDate !== undefined,
      ]
    )
    return result.rows[0] || null
  }
}
