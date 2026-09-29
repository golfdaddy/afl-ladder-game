import { SquiggleService, applyPositionPins, getManualFinalsPins } from '../services/squiggle'
import { AFLLadderModel } from '../models/aflLadder'
import { Season, SeasonModel } from '../models/season'
import { ScoreModel } from '../models/score'
import { deriveResultPins } from '../utils/finalsBracket'
import { notifyAdmin, resetAdminNotify } from '../services/adminNotify'

export interface LadderSyncResult {
  ok: boolean
  skipped?: boolean
  message: string
  year: number
  teamsCount: number
  pins: Record<string, number>
}

interface LadderSyncStatus {
  lastRunAt: Date | null
  lastSuccessAt: Date | null
  consecutiveFailures: number
  last: LadderSyncResult | null
}

const status: LadderSyncStatus = { lastRunAt: null, lastSuccessAt: null, consecutiveFailures: 0, last: null }
const FAILURE_ALERT_THRESHOLD = 3

export function getLadderSyncStatus(): LadderSyncStatus {
  return status
}

/**
 * Pull the home-and-away standings for a season, overlay post-finals positions
 * derived from real finals results (plus any manual overrides), store the
 * snapshot and recalculate every competition's scores.
 *
 * Throws on failure — callers decide whether to surface or swallow.
 */
export async function syncLadderForSeason(season: Season): Promise<LadderSyncResult> {
  const year = season.year
  if (season.status === 'completed') {
    return { ok: true, skipped: true, message: `Season ${year} is completed — ladder frozen`, year, teamsCount: 0, pins: {} }
  }

  const teams = await SquiggleService.fetchStandings(year)
  if (!teams || teams.length === 0) {
    return { ok: true, skipped: true, message: `No standings data for ${year} yet`, year, teamsCount: 0, pins: {} }
  }

  // Pre-season: every team 0-0-0 means nothing has been played
  if (!teams.some(t => t.wins > 0 || t.losses > 0 || t.draws > 0)) {
    return { ok: true, skipped: true, message: `Season ${year} hasn't started (all teams 0-0-0)`, year, teamsCount: teams.length, pins: {} }
  }

  // Post-finals positions from real results; the finals fixture is best-effort
  // so a Squiggle hiccup here still lets the home-and-away ladder sync.
  let autoPins: Record<string, number> = {}
  try {
    const finals = await SquiggleService.fetchFinalsGames(year)
    const played = finals.filter(g => g.winnerName)
    if (played.length > 0) {
      const seeds = [...teams].sort((a, b) => a.position - b.position).map(t => t.teamName)
      autoPins = deriveResultPins(seeds, played, season.finalsFormat)
    }
  } catch (error: any) {
    console.warn(`[LadderSync] Could not fetch finals results for ${year}: ${error.message}`)
  }

  const pins = { ...autoPins, ...getManualFinalsPins(year) }
  const adjusted = applyPositionPins(teams, pins, `post-finals positions for ${year}`)

  await AFLLadderModel.uploadLadder(season.id, adjusted, null, `squiggle-auto-${year}`)
  await ScoreModel.calculateAndUpdateScores(season.id)

  return { ok: true, message: `Synced ${adjusted.length} teams for ${year}`, year, teamsCount: adjusted.length, pins }
}

/**
 * Cron entry point: sync the current season's ladder. Never throws — a failed
 * sync must not crash the server — but alerts the admin after repeated failures.
 */
export async function syncLadderFromSquiggle(): Promise<void> {
  status.lastRunAt = new Date()
  try {
    const season = await SeasonModel.getCurrentSeason()
    if (!season) {
      console.log('[LadderSync] No active season — skipping (the lifecycle job creates the next one from the fixture)')
      return
    }

    console.log(`[LadderSync] Starting sync for ${season.year}...`)
    const result = await syncLadderForSeason(season)
    status.last = result
    status.lastSuccessAt = new Date()
    if (status.consecutiveFailures >= FAILURE_ALERT_THRESHOLD) {
      resetAdminNotify('ladder-sync-failing')
      await notifyAdmin('ladder-sync-recovered', 'Ladder sync recovered', [
        `The AFL ladder sync is working again after ${status.consecutiveFailures} failures.`,
        result.message,
      ], { once: false })
    }
    status.consecutiveFailures = 0
    console.log(`[LadderSync] ${result.skipped ? '–' : '✓'} ${result.message}`)
  } catch (error: any) {
    status.consecutiveFailures++
    status.last = { ok: false, message: error.message, year: 0, teamsCount: 0, pins: {} }
    console.error(`[LadderSync] Failed to sync ladder:`, error.message)
    if (status.consecutiveFailures === FAILURE_ALERT_THRESHOLD) {
      await notifyAdmin('ladder-sync-failing', 'Ladder sync failing', [
        `The AFL ladder sync has failed ${status.consecutiveFailures} times in a row.`,
        `Last error: ${error.message}`,
        'Scores are frozen at the last successful snapshot until it recovers.',
        'Check the Squiggle API (https://api.squiggle.com.au) and /api/admin/health.',
      ])
    }
  }
}
