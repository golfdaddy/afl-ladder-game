import { SevensModel } from '../models/sevens'
import { SeasonModel } from '../models/season'
import { isSevensEnabled } from '../middleware/sevensFeature'

/** Scores completed Super Sevens rounds. Never throws. */
export async function runSevensJobs(): Promise<void> {
  if (!isSevensEnabled()) return
  try {
    const season = await SeasonModel.getCurrentSeason()
    if (!season) return
    const scored = await SevensModel.scoreRounds(season.id, season.year)
    if (scored > 0) console.log(`[Sevens] Scored ${scored} round(s)`)
  } catch (error: any) {
    console.error('[Sevens] Jobs failed:', error.message)
  }
}
