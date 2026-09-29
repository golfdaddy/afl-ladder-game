import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { CUTOFF, GRAND_FINAL } from '../config'
import type { FinalsFormat } from '../utils/finalsBracket'

export type SeasonStatus = 'open' | 'locked' | 'completed'

interface Season {
  id: number
  year: number
  cutoffDate: string
  startDate: string
  grandFinalDate: string | null
  finalsFormat: FinalsFormat
  status: SeasonStatus
}

// Leagues re-open this long after the grand final (matches the backend's
// season lifecycle, which marks the season completed on the same day).
const SEASON_OVER_GRACE_MS = 14 * 24 * 60 * 60 * 1000

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The current active season (open or locked) from the API, with every
 * season-dependent flag derived from it so no page needs hardcoded dates:
 * cutoff/lock, grand final, season complete/over, finals format, year.
 *
 * The endpoint is public, so this works on login/register pages too. When the
 * API has no active season (between seasons, or unreachable) the config
 * defaults are the fallback and the year rolls to the upcoming season from
 * October. Cached for 1 hour — seasons change infrequently.
 */
export function useCurrentSeason() {
  const query = useQuery({
    queryKey: ['current-season'],
    queryFn: async () => {
      const res = await api.get('/seasons/current')
      return res.data.season as Season
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  })

  const season = query.data
  const now = Date.now()

  const cutoffAt = parseDate(season?.cutoffDate) ?? CUTOFF
  // Only fall back to the configured grand final when we have no season at all;
  // an active season with no GF date yet means the finals fixture isn't out.
  const grandFinalAt = season ? parseDate(season.grandFinalDate) : GRAND_FINAL

  const lockOverride = import.meta.env.VITE_COMPETITION_LOCKED
  const isLocked = lockOverride === 'true'
    ? true
    : lockOverride === 'false'
    ? false
    : season?.status === 'locked' || season?.status === 'completed' || now >= cutoffAt.getTime()

  const seasonComplete = season?.status === 'completed' || (!!grandFinalAt && now >= grandFinalAt.getTime())
  const seasonOver = season?.status === 'completed' || (!!grandFinalAt && now >= grandFinalAt.getTime() + SEASON_OVER_GRACE_MS)

  const fallbackDate = new Date()
  const fallbackYear = fallbackDate.getMonth() >= 9 ? fallbackDate.getFullYear() + 1 : fallbackDate.getFullYear()

  return {
    ...query,
    season,
    hasActiveSeason: !!season,
    /** The current season ID — falls back to 1 while loading or on error */
    seasonId: season?.id ?? 1,
    seasonYear: season?.year ?? fallbackYear,
    seasonStatus: (season?.status ?? null) as SeasonStatus | null,
    finalsFormat: (season?.finalsFormat ?? 'wildcard10') as FinalsFormat,
    cutoffAt,
    grandFinalAt,
    isLocked,
    /** Grand final played (or season completed): final standings and honours can show */
    seasonComplete,
    /** Two weeks after the grand final (or season completed): leagues re-open for next year */
    seasonOver,
  }
}
