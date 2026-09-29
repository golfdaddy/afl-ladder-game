import { SeasonModel, Season } from '../models/season'
import { SquiggleService } from '../services/squiggle'
import { notifyAdmin } from '../services/adminNotify'

// Days after the grand final before a season is marked completed. Leaves a
// window for final-ladder corrections and for players to enjoy the honours
// before leagues re-open for next year.
const COMPLETE_AFTER_GF_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

interface LifecycleStatus {
  lastRunAt: Date | null
  lastMessage: string | null
}

const status: LifecycleStatus = { lastRunAt: null, lastMessage: null }

export function getSeasonLifecycleStatus(): LifecycleStatus {
  return status
}

function melbourneYear(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-AU', {
    timeZone: process.env.APP_TIMEZONE || 'Australia/Melbourne',
    year: 'numeric',
  }).format(now))
}

function toDateOnly(d: Date | string | null): string | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

/**
 * Runs the season through its states without anyone having to prompt it:
 *   open ──(cutoff passes)──▶ locked ──(grand final + 14 days)──▶ completed
 * and, once no season is active, creates the next one as soon as Squiggle
 * publishes that year's fixture (start = first game, cutoff = first game day,
 * grand final date when known). Never throws.
 */
export async function runSeasonLifecycle(now: Date = new Date()): Promise<string[]> {
  const events: string[] = []
  status.lastRunAt = now
  try {
    let current = await SeasonModel.getCurrentSeason()

    if (current) {
      current = await advanceSeason(current, now, events)
    }

    if (!current) {
      await createNextSeasonIfPublished(now, events)
    }

    status.lastMessage = events.length ? events.join(' | ') : 'No changes'
    console.log(`[SeasonLifecycle] ${status.lastMessage}`)
  } catch (error: any) {
    status.lastMessage = `Failed: ${error.message}`
    console.error('[SeasonLifecycle] Failed:', error.message)
  }
  return events
}

/** Move an active season forward; returns null once it has been completed. */
async function advanceSeason(season: Season, now: Date, events: string[]): Promise<Season | null> {
  let s = season

  // Learn the grand final date as soon as the finals fixture is published
  if (!s.grandFinalDate) {
    try {
      const fixture = await SquiggleService.fetchSeasonFixture(s.year)
      if (fixture.grandFinalDate) {
        s = (await SeasonModel.updateSettings(s.id, { grandFinalDate: fixture.grandFinalDate })) || s
        events.push(`Season ${s.year}: grand final date set to ${fixture.grandFinalDate}`)
      }
    } catch (error: any) {
      console.warn(`[SeasonLifecycle] Fixture lookup failed for ${s.year}: ${error.message}`)
    }
  }

  if (s.status === 'open' && now.getTime() >= new Date(s.cutoffDate).getTime()) {
    s = (await SeasonModel.setStatus(s.id, 'locked')) || s
    events.push(`Season ${s.year}: predictions locked (cutoff ${toDateOnly(s.cutoffDate)})`)
    await notifyAdmin(`season-${s.year}-locked`, `Season ${s.year} predictions locked`, [
      `The ${s.year} cutoff (${toDateOnly(s.cutoffDate)}) has passed — predictions are now locked.`,
      'The ladder syncs hourly from here; scores update automatically.',
    ])
  }

  if (s.grandFinalDate && now.getTime() >= new Date(s.grandFinalDate).getTime() + COMPLETE_AFTER_GF_DAYS * DAY_MS) {
    await SeasonModel.setStatus(s.id, 'completed')
    events.push(`Season ${s.year}: completed (${COMPLETE_AFTER_GF_DAYS} days after the grand final)`)
    await notifyAdmin(`season-${s.year}-completed`, `Season ${s.year} completed`, [
      `Season ${s.year} has been marked completed — its ladder and scores are now frozen.`,
      `The ${s.year + 1} season will be created automatically once the AFL fixture is published on Squiggle.`,
    ])
    return null
  }

  return s
}

/** Create the next season from Squiggle's fixture once it exists. */
async function createNextSeasonIfPublished(now: Date, events: string[]): Promise<void> {
  const latest = await SeasonModel.getLatestSeason()
  const year = Math.max((latest?.year ?? melbourneYear(now) - 1) + 1, melbourneYear(now))

  if (await SeasonModel.getSeasonByYear(year)) return

  const fixture = await SquiggleService.fetchSeasonFixture(year)
  if (!fixture.firstGameDate) {
    events.push(`No ${year} fixture on Squiggle yet — will retry`)
    return
  }

  const created = await SeasonModel.createSeason({
    year,
    startDate: fixture.firstGameDate,
    cutoffDate: fixture.firstGameDate,
    grandFinalDate: fixture.grandFinalDate,
    finalsFormat: latest?.finalsFormat ?? 'wildcard10',
  })
  if (!created) return

  events.push(`Season ${year} created from fixture (first game ${fixture.firstGameDate}, ${fixture.gameCount} games)`)
  await notifyAdmin(`season-${year}-created`, `Season ${year} created`, [
    `The ${year} AFL fixture is out, so the ${year} season has been created automatically:`,
    `  • First game / season start: ${fixture.firstGameDate}`,
    `  • Prediction cutoff: ${fixture.firstGameDate} (locks at the start of that day — adjust in the Admin page if you want an earlier deadline)`,
    `  • Grand final: ${fixture.grandFinalDate ?? 'not published yet — will be picked up automatically'}`,
    `  • Finals format: ${created.finalsFormat}`,
    'Players can now create and join leagues and enter predictions.',
  ])
}
