import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

type LeaderboardType = 'global' | 'personal'

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<LeaderboardType>('global')
  const [seasonId] = useState('1')

  const { data: globalData, isLoading: globalLoading } = useQuery({
    queryKey: ['leaderboard', 'global', seasonId],
    queryFn: async () => {
      const response = await api.get(`/leaderboards/global/${seasonId}`)
      return response.data.leaderboard
    },
    enabled: activeTab === 'global'
  })

  const { data: personalData, isLoading: personalLoading } = useQuery({
    queryKey: ['leaderboard', 'personal', seasonId],
    queryFn: async () => {
      const response = await api.get(`/leaderboards/personal/${seasonId}`)
      return response.data.leaderboard
    },
    enabled: activeTab === 'personal'
  })

  const isLoading = activeTab === 'global' ? globalLoading : personalLoading
  const data = activeTab === 'global' ? globalData : personalData

  const medalColors = [
    'bg-amber-400 text-white',    // gold
    'bg-slate-400 text-white',    // silver
    'bg-orange-600 text-white',   // bronze
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark header */}
      <div className="bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-0">
          <div className="flex items-center justify-between mb-6">
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

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800 rounded-xl p-1 w-fit">
            {([
              { key: 'global', label: 'Global' },
              { key: 'personal', label: 'My Competitions' }
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.key
                    ? 'bg-emerald-500 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Spacer to flow into content */}
          <div className="h-6"></div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-slate-100"></div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="font-bold text-slate-900 mb-1">No scores yet</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              {activeTab === 'global'
                ? 'Scores will appear once the season starts and the AFL ladder is updated.'
                : 'Join a competition and submit your prediction to appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((item: any, index: number) => (
              <div
                key={index}
                className={`bg-white rounded-xl border shadow-sm px-5 py-4 flex items-center gap-4 ${
                  index === 0 ? 'border-amber-200 ring-1 ring-amber-200' :
                  index === 1 ? 'border-slate-200 ring-1 ring-slate-200' :
                  index === 2 ? 'border-orange-200 ring-1 ring-orange-200' :
                  'border-slate-100'
                }`}
              >
                {/* Rank badge */}
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

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">
                    {activeTab === 'global' ? item.displayName : item.competitionName}
                  </p>
                  {activeTab === 'global' && (
                    <p className="text-sm text-slate-400 truncate">{item.competitionCount} competition{item.competitionCount !== 1 ? 's' : ''}</p>
                  )}
                </div>

                {/* Score */}
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-black text-slate-900">{item.totalPoints}</p>
                  <p className="text-xs text-slate-400">
                    {activeTab === 'global' ? `avg ${parseFloat(item.avgPoints).toFixed(1)}` : 'pts'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scoring info */}
        <div className="mt-8 bg-slate-900 rounded-2xl p-6">
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
