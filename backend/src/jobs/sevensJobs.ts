import { db } from '../db'
import { SevensModel } from '../models/sevens'
import { MultiPropsModel } from '../models/multiProps'
import { SeasonModel } from '../models/season'
import { isSevensEnabled } from '../middleware/sevensFeature'

/**
 * Ingests player stats + the player directory, then scores completed rounds.
 * The stats/directory ingest also runs in the Multi cron, but Super Sevens
 * needs it independently so it works when only Sevens is enabled (the ingest
 * is idempotent — it only fetches matches not already stored). Never throws.
 */
export async function runSevensJobs(): Promise<void> {
  if (!isSevensEnabled()) return
  try {
    const season = await SeasonModel.getCurrentSeason()
    if (!season) return

    // Player stats (also feeds pricing/form)
    const ingested = await MultiPropsModel.ingestPlayerStats(season.year)
    if (ingested > 0) console.log(`[Sevens] Ingested player stats for ${ingested} matches`)

    // Directory (positions) — refresh when empty or stale (squads barely move intraday)
    const dir = await db.query(`SELECT COUNT(*)::int AS count, MAX(updated_at) AS latest FROM multi_players`)
    const { count, latest } = dir.rows[0]
    if (count === 0 || !latest || Date.now() - new Date(latest).getTime() > 24 * 60 * 60 * 1000) {
      const upserted = await MultiPropsModel.refreshPlayerDirectory(season.year)
      console.log(`[Sevens] Player directory refreshed (${upserted})`)
    }

    const scored = await SevensModel.scoreRounds(season.id, season.year)
    if (scored > 0) console.log(`[Sevens] Scored ${scored} round(s)`)
  } catch (error: any) {
    console.error('[Sevens] Jobs failed:', error.message)
  }
}
