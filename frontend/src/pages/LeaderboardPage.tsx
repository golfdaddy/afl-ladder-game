import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useCurrentSeason } from '../hooks/useCurrentSeason'

interface Competition {
  id: number
  name: string
  description?: string
  memberCount: number
  userHasSubmitted: boolean
  userRank: number | null
  userScore: number | null
}

const medalColors = [
  'bg-amber-400 text-white',
  'bg-slate-400 text-white',
  'bg-orange-600 text-white',
]

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { seasonId } = useCurrentSeason()

  const { data: competitions = [], isLoading: compsLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const response = await api.get('/competitions')
      return (response.data.competitions || []) as Competition[]
    }
  })

  const { data: globalData = [], isLoading: globalLoading } = useQuery({
    queryKey: ['leaderboard', 'global', seasonId],
    queryFn: async () => {
      const response = await api.get(`/leaderboards/global/${seasonId}`)
      return response.data.leaderboard || []
    },
    enabled: seasonId > 0,
  })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark header */}
      <div className="bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-black text-white">Leaderboards</h1>
              <p className="text-slate-400 text-sm">2026 AFL Season</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

        {/* ── MY COMPETITIONS ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">My Competitions</h2>

          {compsLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-slate-100" />
              ))}
            </div>
          ) : competitions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                </svg>
              </div>
              <p className="font-bold text-slate-900 mb-1">No competitions yet</p>
              <p className="text-sm text-slate-500 mb-5">Create or join a competition to compete with friends.</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {competitions.map((comp) => (
                <button
                  key={comp.id}
                  onClick={() => navigate(`/competition/${comp.id}`)}
                  className="w-full bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4 hover:border-emerald-300 hover:shadow-md transition-all text-left group"
                >
                  {/* Icon */}
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500 transition-colors">
                    <svg className="w-5 h-5 text-emerald-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{comp.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-sm text-slate-400">{comp.memberCount} member{comp.memberCount !== 1 ? 's' : ''}</span>
                      {comp.userHasSubmitted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                          Not submitted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rank / chevron */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {comp.userRank !== null && (
                      <div className="text-right">
                        <p className="text-lg font-black text-slate-900">#{comp.userRank}</p>
                        <p className="text-xs text-slate-400">your rank</p>
                      </div>
                    )}
                    <svg className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── GLOBAL LEADERBOARD ── */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Global Leaderboard</h2>

          {globalLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-slate-100" />
              ))}
            </div>
          ) : globalData.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="font-bold text-slate-900 mb-1">No scores yet</p>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                Scores will appear once the season starts and the AFL ladder is updated.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {globalData.map((item: any, index: number) => (
                <div
                  key={index}
                  className={`bg-white rounded-xl border shadow-sm px-5 py-4 flex items-center gap-4 ${
                    index === 0 ? 'border-amber-200 ring-1 ring-amber-200' :
                    index === 1 ? 'border-slate-200 ring-1 ring-slate-200' :
                    index === 2 ? 'border-orange-200 ring-1 ring-orange-200' :
                    'border-slate-100'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {index < 3 ? (
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${medalColors[index]}`}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm">
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{item.displayName}</p>
                    <p className="text-sm text-slate-400">{item.competitionCount} competition{item.competitionCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {item.totalPoints != null ? (
                      <p className="text-2xl font-black text-slate-900">{item.totalPoints}</p>
                    ) : (
                      <p className="text-sm font-semibold text-slate-400">—</p>
                    )}
                    <p className="text-xs text-slate-400">{item.competitionCount} comp{item.competitionCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Scoring info */}
        <div className="bg-slate-900 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-white mb-1">How scoring works</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Each team scores points equal to the difference between your predicted and actual position.
                If you tip a team 3rd and they finish 6th, that's 3 points. Lower total = better. Perfect score = 0.
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
