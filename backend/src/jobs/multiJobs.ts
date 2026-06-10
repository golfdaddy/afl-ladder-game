import { MultiModel } from '../models/multi'
import { SeasonModel } from '../models/season'
import { isMultiEnabled } from '../middleware/multiFeature'

/** ISO week key like '2026-W24' in Melbourne time. */
function currentIsoWeek(): string {
  const tz = process.env.APP_TIMEZONE || 'Australia/Melbourne'
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [y, m, d] = parts.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // ISO week: Thursday of the current week determines the year/week number
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Settles finished bets and processes the weekly top-up.
 * Never throws — a failed run must not crash the server.
 */
export async function runMultiJobs(): Promise<void> {
  if (!isMultiEnabled()) return
  try {
    const season = await SeasonModel.getCurrentSeason()
    if (!season) return

    const settled = await MultiModel.settleBets(season.id, season.year)
    if (settled.legsSettled > 0 || settled.betsSettled > 0) {
      console.log(`[Multi] Settled ${settled.legsSettled} legs, ${settled.betsSettled} bets`)
    }

    const topup = await MultiModel.weeklyTopup(season.id, currentIsoWeek())
    if (!topup.skipped) {
      console.log(`[Multi] Weekly top-up credited to ${topup.credited} accounts`)
    }
  } catch (error: any) {
    console.error('[Multi] Jobs failed:', error.message)
  }
}
