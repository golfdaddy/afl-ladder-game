import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'

interface TeamEntry {
  position: number
  teamName: string
  actualPosition: number | null
  diff: number | null
  points: number | null
}

interface UserPrediction {
  userId: number
  displayName: string
  teams: TeamEntry[]
  totalScore: number | null
  ladderRound: number | null
  ladderUpdatedAt: string | null
}

const SEASON_ID = 1

export default function UserLadderPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)

  // Fetch the target user's prediction
  const { data: targetData, isLoading: targetLoading } = useQuery({
    queryKey: ['prediction', 'user', userId, SEASON_ID],
    queryFn: async () => {
      const res = await api.get(`/predictions/${SEASON_ID}/user/${userId}`)
      return res.data.prediction as UserPrediction
    },
    enabled: !!userId,
  })

  // Fetch the logged-in user's own prediction (for comparison)
  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ['prediction', SEASON_ID],
    queryFn: async () => {
      const res = await api.get(`/predictions/${SEASON_ID}`)
      return res.data.prediction as UserPrediction
    },
  })

  const isViewingOwnLadder = userId && currentUser && parseInt(userId) === currentUser.id
  const isLoading = targetLoading || myLoading

  // Build a lookup from my teams: position → teamName
  const myTeamByPosition: Record<number, string> = {}
  if (myData?.teams) {
    for (const t of myData.teams) {
      myTeamByPosition[t.position] = t.teamName
    }
  }

  const positionColor = (pos: number) => {
    if (pos <= 4)  return 'bg-emerald-50 border-emerald-200 text-emerald-800'
    if (pos <= 8)  return 'bg-blue-50 border-blue-200 text-blue-800'
    if (pos <= 14) return 'bg-slate-50 border-slate-200 text-slate-700'
    return 'bg-red-50 border-red-200 text-red-700'
  }

  const diffColor = (pts: number | null) => {
    if (pts === null) return 'text-slate-400'
    if (pts === 0)    return 'text-emerald-600 font-bold'
    if (pts <= 2)     return 'text-amber-500 font-semibold'
    return 'text-red-500 font-semibold'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-slate-900 h-32" />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-12 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!targetData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-900 font-bold text-lg mb-1">Ladder not found</p>
          <p className="text-slate-500 text-sm mb-6">This user hasn't submitted a prediction.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const hasComparison = !isViewingOwnLadder && myData?.teams && myData.teams.length > 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark header */}
      <div className="bg-slate-900">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors mt-0.5 flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-1">
                2026 AFL Prediction
              </p>
              <h1 className="text-2xl font-black text-white">
                {isViewingOwnLadder ? 'Your Ladder' : `${targetData.displayName}'s Ladder`}
              </h1>
              {targetData.totalScore !== null && (
                <p className="mt-1 text-slate-400 text-sm">
                  Score: <span className="text-emerald-400 font-bold">{targetData.totalScore} pts</span>
                  {targetData.ladderRound && (
                    <span className="ml-2 text-slate-500">· after round {targetData.ladderRound}</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* My score for comparison */}
          {hasComparison && myData.totalScore !== null && (
            <div className="mt-4 ml-12 flex gap-6">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Their score</p>
                <p className="text-2xl font-black text-emerald-400">{targetData.totalScore ?? '—'}</p>
              </div>
              <div className="w-px bg-slate-800" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Your score</p>
                <p className="text-2xl font-black text-amber-400">{myData.totalScore ?? '—'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Column headers */}
        <div className={`grid gap-2 mb-2 px-2 ${hasComparison ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}>
          <div />
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {isViewingOwnLadder ? 'Your Pick' : `${targetData.displayName.split(' ')[0]}'s Pick`}
          </div>
          {hasComparison && (
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Your Pick
            </div>
          )}
        </div>

        {/* Ladder rows */}
        <div className="space-y-1">
          {targetData.teams.map((team) => {
            const myTeamHere = hasComparison ? myTeamByPosition[team.position] : null
            const isDifferent = hasComparison && myTeamHere && myTeamHere !== team.teamName
            const isSame = hasComparison && myTeamHere && myTeamHere === team.teamName

            return (
              <div
                key={team.position}
                className={`grid items-center gap-2 rounded-xl px-2 py-1.5 transition-colors ${
                  isDifferent ? 'bg-white border border-slate-200' :
                  isSame ? 'bg-emerald-50/60 border border-emerald-100' :
                  'bg-white border border-slate-100'
                } ${hasComparison ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
              >
                {/* Position badge */}
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${positionColor(team.position)}`}>
                  <span className="text-xs font-black">{team.position}</span>
                </div>

                {/* Their team */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-slate-900 text-sm truncate">{team.teamName}</span>
                  {team.points !== null && (
                    <span className={`text-xs flex-shrink-0 ${diffColor(team.points)}`}>
                      {team.points === 0 ? '✓' : `+${team.points}`}
                    </span>
                  )}
                </div>

                {/* My team (comparison column) */}
                {hasComparison && myTeamHere && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isDifferent ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-700 text-sm truncate">{myTeamHere}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-700 text-sm truncate">{myTeamHere}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        {hasComparison && (
          <div className="mt-4 flex items-center gap-5 px-2 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Same pick
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Different pick
            </div>
            {targetData.totalScore !== null && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-semibold text-slate-500">+N</span> = penalty pts per team
              </div>
            )}
          </div>
        )}

        {/* AFL actual positions note */}
        {targetData.ladderUpdatedAt && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Scores based on AFL ladder at round {targetData.ladderRound}
          </p>
        )}

        {!targetData.totalScore && !targetData.ladderUpdatedAt && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Scores will update once the AFL season starts
          </p>
        )}
      </main>
    </div>
  )
}
