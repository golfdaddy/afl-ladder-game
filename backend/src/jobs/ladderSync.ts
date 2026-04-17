import { SquiggleService } from '../services/squiggle'
import { AFLLadderModel } from '../models/aflLadder'
import { SeasonModel } from '../models/season'

function getMelbourneYear(): number {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: process.env.APP_TIMEZONE || 'Australia/Melbourne',
    year: 'numeric',
  })
  return Number(formatter.format(new Date()))
}

/**
 * Syncs the AFL ladder from the Squiggle API for the current season.
 * - Skips upload if no games have been played yet (pre-season: all teams 0-0-0).
 * - Never throws — a failed sync must not crash the server.
 */
export async function syncLadderFromSquiggle(): Promise<void> {
  try {
    const currentSeason = await SeasonModel.getCurrentSeason()
    const year = currentSeason?.year || getMelbourneYear()
    console.log(`[LadderSync] Starting sync for ${year}...`)

    const seasonId = currentSeason?.id
    if (!seasonId) {
      console.log(`[LadderSync] No active season found for year ${year} — skipping`)
      return
    }

    // Fetch standings from Squiggle
    const teams = await SquiggleService.fetchStandings(year)
    if (!teams || teams.length === 0) {
      console.log(`[LadderSync] No standings data returned for ${year} — skipping`)
      return
    }

    // Skip pre-season: if every team has 0 wins, 0 losses and 0 draws the season hasn't started
    const hasGames = teams.some(t => t.wins > 0 || t.losses > 0 || t.draws > 0)
    if (!hasGames) {
      console.log(`[LadderSync] Season ${year} hasn't started yet (all teams 0-0-0) — skipping upload`)
      return
    }

    // Upload the new snapshot (null round = "latest auto-sync")
    await AFLLadderModel.uploadLadder(seasonId, teams, null, `squiggle-auto-${year}`)
    console.log(`[LadderSync] ✓ Successfully synced ${teams.length} teams for season ${year}`)
  } catch (error: any) {
    // Log but do NOT re-throw — a failed sync must never crash the running server
    console.error(`[LadderSync] Failed to sync ladder:`, error.message)
  }
}
