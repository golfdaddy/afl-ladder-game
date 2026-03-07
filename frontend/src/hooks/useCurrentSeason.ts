import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { CUTOFF } from '../config'

interface Season {
  id: number
  year: number
  cutoffDate: string
  startDate: string
  status: 'open' | 'locked' | 'completed'
}

/**
 * Fetches the current active season (open or locked) from the API.
 *
 * Returns the season object and a convenience `seasonId` that always falls
 * back to `1` so existing hardcoded queries continue to work if the API is
 * temporarily unavailable or no season is returned yet.
 *
 * The result is cached for 1 hour — seasons change infrequently.
 */
export function useCurrentSeason() {
  const { isAuthenticated } = useAuthStore()

  const query = useQuery({
    queryKey: ['current-season'],
    queryFn: async () => {
      const res = await api.get('/seasons/current')
      return res.data.season as Season
    },
    enabled: isAuthenticated,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  })

  const parsedCutoff = query.data?.cutoffDate ? new Date(query.data.cutoffDate) : CUTOFF
  const cutoffAt = Number.isNaN(parsedCutoff.getTime()) ? CUTOFF : parsedCutoff
  const lockOverride = import.meta.env.VITE_COMPETITION_LOCKED
  const isLocked = lockOverride === 'true'
    ? true
    : lockOverride === 'false'
    ? false
    : Date.now() >= cutoffAt.getTime()

  return {
    ...query,
    /** The current season ID — falls back to 1 while loading or on error */
    seasonId: query.data?.id ?? 1,
    seasonYear: query.data?.year ?? cutoffAt.getFullYear(),
    cutoffAt,
    isLocked,
  }
}
