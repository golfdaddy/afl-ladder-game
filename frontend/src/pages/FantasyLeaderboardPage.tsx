import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { FantasyLeaderboardEntry, FantasyRound } from '../types/fantasy'

export default function FantasyLeaderboardPage() {
  const { competitionId: competitionIdRaw } = useParams<{ competitionId: string }>()
  const competitionId = Number(competitionIdRaw)
  const navigate = useNavigate()

  const { data: competitionData } = useQuery({
    queryKey: ['fantasy-competition', competitionId],
    queryFn: async () => {
      const response = await api.get(`/fantasy/competitions/${competitionId}`)
      return response.data
    },
    enabled: Number.isFinite(competitionId),
  })

  const { data: currentRound } = useQuery({
    queryKey: ['fantasy-current-round', competitionId],
    queryFn: async () => {
      const response = await api.get('/fantasy/rounds/current', { params: { competitionId } })
      return response.data.round as FantasyRound
    },
    enabled: Number.isFinite(competitionId),
  })

  const { data: weeklyLeaderboard = [] } = useQuery({
    queryKey: ['fantasy-weekly-leaderboard', competitionId, currentRound?.id],
    queryFn: async () => {
      const response = await api.get(`/fantasy/leaderboards/competition/${competitionId}`, {
        params: currentRound?.id ? { roundId: currentRound.id } : {},
      })
      return (response.data.leaderboard || []) as FantasyLeaderboardEntry[]
    },
    enabled: Number.isFinite(competitionId),
  })

  const { data: seasonLeaderboard = [] } = useQuery({
    queryKey: ['fantasy-season-leaderboard', competitionId],
    queryFn: async () => {
      const response = await api.get(`/fantasy/leaderboards/season/${competitionId}`)
      return (response.data.leaderboard || []) as FantasyLeaderboardEntry[]
    },
    enabled: Number.isFinite(competitionId),
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <button
            onClick={() => navigate(`/fantasy/competition/${competitionId}`)}
            className="text-slate-400 hover:text-white text-sm font-semibold"
          >
            ← Back to Competition
          </button>
          <h1 className="text-3xl font-black text-white mt-2">Fantasy Leaderboards</h1>
          <p className="text-sm text-slate-400 mt-2">{competitionData?.competition?.name || 'Competition'}</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            Weekly {currentRound ? `(Round ${currentRound.roundNo})` : ''}
          </h2>
          {weeklyLeaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No weekly scores yet.</p>
          ) : (
            <div className="space-y-2">
              {weeklyLeaderboard.map((entry) => (
                <div key={`week-${entry.userId}`} className="rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">#{entry.rank} {entry.displayName}</p>
                    <p className="text-xs text-slate-500">Salary ${entry.salaryUsed}</p>
                  </div>
                  <p className="text-base font-black text-emerald-600">{entry.points.toFixed(1)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Season Total</h2>
          {seasonLeaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No season scores yet.</p>
          ) : (
            <div className="space-y-2">
              {seasonLeaderboard.map((entry) => (
                <div key={`season-${entry.userId}`} className="rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">#{entry.rank} {entry.displayName}</p>
                    <p className="text-xs text-slate-500">Salary total ${entry.salaryUsed}</p>
                  </div>
                  <p className="text-base font-black text-emerald-600">{entry.points.toFixed(1)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
