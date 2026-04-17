import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import {
  getTeamMeta, zoneConfig, getZone, posBadgeClass, ptsColorClass,
  classifyTeam, getScoreForMember, totalForMember,
} from '../utils/aflTeams'
import FullSeasonSimulator from '../components/FullSeasonSimulator'
import FinalsPredictor from '../components/FinalsPredictor'
import { SEASON_OVER, FEATURE_FANTASY7_ENABLED } from '../config'
import { useCurrentSeason } from '../hooks/useCurrentSeason'

function useCountdown(target: Date) {
  const calc = () => {
    const diff = target.getTime() - Date.now()
    if (diff <= 0) return null
    const days    = Math.floor(diff / 86_400_000)
    const hours   = Math.floor((diff % 86_400_000) / 3_600_000)
    const minutes = Math.floor((diff % 3_600_000)  / 60_000)
    const seconds = Math.floor((diff % 60_000)     / 1_000)
    return { days, hours, minutes, seconds, totalMs: diff }
  }
  const [remaining, setRemaining] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setRemaining(calc()), 1000)
    return () => clearInterval(id)
  }, [])
  return remaining
}

interface Competition {
  id: number
  name: string
  description?: string
  seasonId: number
  isPublic: boolean
  joinCode: string
  createdAt: string
  memberCount: number
  userRank: number | null
  userScore: number | null
  userHasSubmitted: boolean
}

interface PendingInvite {
  id: number
  competitionId: number
  inviteToken: string
  createdAt: string
  competitionName: string
  competitionDescription: string
  invitedByName: string
}

interface LeaderboardEntry {
  userId: number
  displayName: string
  totalPoints: number
}

interface MemberPrediction {
  userId: number
  displayName: string
  submittedAt: string
  ladder: string[]
}


export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const isAdmin = useAuthStore((state) => state.isAdmin)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { seasonId, seasonYear, cutoffAt, isLocked: competitionLocked } = useCurrentSeason()
  const countdown = useCountdown(cutoffAt)

  const [activePanel, setActivePanel] = useState<'none' | 'create' | 'join'>('none')
  const [formData, setFormData] = useState({ name: '', description: '', isPublic: false })
  const [joinCode, setJoinCode] = useState('')
  const [createError, setCreateError] = useState('')
  const [joinError, setJoinError] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [dashSpotlightTeam, setDashSpotlightTeam] = useState<string>('')
  const [dashView, setDashView] = useState<'compare' | 'spotlight' | 'leaderboard' | 'predictor'>('compare')
  const [dashPredictorMode, setDashPredictorMode] = useState<'auto' | 'games'>('auto')
  const [dashSelectedModel, setDashSelectedModel] = useState<string>('consensus')
  // Collapse competitions list by default when locked (spotlight section is the main view)
  const [showComps, setShowComps] = useState(!competitionLocked)

  useEffect(() => {
    if (competitionLocked) setShowComps(false)
  }, [competitionLocked])

  // Fetch user's competitions
  const { data: competitions = [], isLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const response = await api.get('/competitions')
      return response.data.competitions || []
    }
  })

  // Fetch pending invites for the current user
  const { data: pendingInvites = [] } = useQuery({
    queryKey: ['myInvites'],
    queryFn: async () => {
      const response = await api.get('/competitions/invites/mine')
      return response.data.invites || []
    }
  })

  // First competition (for the locked dashboard spotlight)
  const firstComp = (competitions as Competition[])[0]

  // Leaderboard for first competition (only when locked)
  const { data: spotlightLeaderboard = [] } = useQuery({
    queryKey: ['leaderboard', 'competition', firstComp?.id],
    queryFn: async () => {
      const response = await api.get(`/leaderboards/competition/${firstComp.id}`)
      return (response.data.leaderboard || []) as LeaderboardEntry[]
    },
    enabled: competitionLocked && !!firstComp,
  })

  // Member predictions for first competition (only when locked)
  const { data: spotlightPredictions = [] } = useQuery({
    queryKey: ['competition', firstComp?.id, 'predictions'],
    queryFn: async () => {
      const response = await api.get(`/competitions/${firstComp.id}/predictions`)
      return (response.data.predictions || []) as MemberPrediction[]
    },
    enabled: competitionLocked && !!firstComp,
  })

  // Fetch current AFL ladder for side-by-side comparison
  const { data: aflLadderData } = useQuery({
    queryKey: ['afl-ladder', seasonId],
    queryFn: async () => {
      const response = await api.get(`/admin/afl-ladder/${seasonId}`)
      return response.data
    },
    enabled: competitionLocked && seasonId > 0,
    retry: false,
  })

  const { data: dashProjectedData, isLoading: dashProjectedLoading } = useQuery({
    queryKey: ['afl-projected-ladder'],
    queryFn: () => api.get('/admin/afl-projected-ladder').then(r => r.data),
    enabled: true,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // AFL current ladder — sorted by position ascending → array of team names
  const aflTeams: string[] = (() => {
    const teams = aflLadderData?.ladder?.teams
    if (!Array.isArray(teams) || teams.length === 0) return []
    return [...teams]
      .sort((a: any, b: any) => a.position - b.position)
      .map((t: any) => t.teamName)
  })()

  // Members sorted for League Compare: current user first, then by score
  const dashSortedPredictions = useMemo(() => {
    const preds = spotlightPredictions as MemberPrediction[]
    if (aflTeams.length === 0 || preds.length === 0) return []
    return [...preds].sort((a, b) => {
      if (a.userId === user?.id) return -1
      if (b.userId === user?.id) return 1
      return totalForMember(a, aflTeams) - totalForMember(b, aflTeams)
    })
  }, [spotlightPredictions, aflTeams, user])

  // Auto-select most divisive team for dashboard spotlight
  useEffect(() => {
    if (aflTeams.length === 0 || (spotlightPredictions as MemberPrediction[]).length === 0 || dashSpotlightTeam) return
    let highestVariance = -1
    let bestTeam = aflTeams[0]
    for (const team of aflTeams) {
      const positions = (spotlightPredictions as MemberPrediction[]).map(mp => mp.ladder.indexOf(team) + 1)
      const mean = positions.reduce((a, b) => a + b, 0) / positions.length
      const variance = positions.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positions.length
      if (variance > highestVariance) { highestVariance = variance; bestTeam = team }
    }
    setDashSpotlightTeam(bestTeam)
  }, [aflTeams, spotlightPredictions, dashSpotlightTeam])

  const dashSpotlightRows = useMemo(() => {
    if (!dashSpotlightTeam || aflTeams.length === 0 || (spotlightPredictions as MemberPrediction[]).length === 0) return []
    const actualPos = aflTeams.indexOf(dashSpotlightTeam) + 1
    return (spotlightPredictions as MemberPrediction[])
      .map(mp => {
        const predictedPos = mp.ladder.indexOf(dashSpotlightTeam) + 1
        const error = Math.abs(predictedPos - actualPos)
        const lbIdx = (spotlightLeaderboard as LeaderboardEntry[]).findIndex(l => l.userId === mp.userId)
        return {
          userId: mp.userId,
          displayName: mp.displayName,
          predictedPos,
          actualPos,
          error,
          totalPoints: lbIdx >= 0 ? (spotlightLeaderboard as LeaderboardEntry[])[lbIdx].totalPoints : null,
        }
      })
      .sort((a, b) => a.predictedPos - b.predictedPos)
  }, [dashSpotlightTeam, aflTeams, spotlightPredictions, spotlightLeaderboard])

  // ── Dashboard Predictor memos ─────────────────────────────────────────────

  const dashAvailableModels = useMemo(() => {
    if (!dashProjectedData?.projections?.length) return []
    return [...new Set((dashProjectedData.projections as any[]).map((p: any) => p.source as string))]
  }, [dashProjectedData])

  const dashConsensusData = useMemo(() => {
    if (!dashProjectedData?.projections?.length) return []
    const projections = dashProjectedData.projections as any[]
    const teams = [...new Set(projections.map((p: any) => p.teamName as string))]
    const models = [...new Set(projections.map((p: any) => p.source as string))]
    return teams.map(teamName => {
      const teamProjs = projections.filter((p: any) => p.teamName === teamName)
      const ranks = teamProjs.map((p: any) => p.rank as number)
      const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length
      const ranksByModel: Record<string, number> = {}
      for (const p of teamProjs) ranksByModel[p.source] = p.rank
      const zoneTallies = {
        top4: ranks.filter(r => r <= 4).length,
        finals: ranks.filter(r => r >= 5 && r <= 10).length,
        mid: ranks.filter(r => r >= 11 && r <= 14).length,
        bottom: ranks.filter(r => r >= 15).length,
        total: models.length,
      }
      return { teamName, avgRank, ranksByModel, zoneTallies }
    }).sort((a, b) => a.avgRank - b.avgRank)
  }, [dashProjectedData])

  const dashProjectedTeamOrder = useMemo((): string[] => {
    if (!dashProjectedData?.projections?.length) return []
    if (dashSelectedModel === 'consensus') return dashConsensusData.map(d => d.teamName)
    return (dashProjectedData.projections as any[])
      .filter((p: any) => p.source === dashSelectedModel)
      .sort((a: any, b: any) => a.rank - b.rank)
      .map((p: any) => p.teamName as string)
  }, [dashProjectedData, dashSelectedModel, dashConsensusData])

  const dashProjectedWinsMap = useMemo((): Record<string, number> => {
    if (!dashProjectedData?.projections?.length) return {}
    return Object.fromEntries(
      (dashProjectedData.projections as any[])
        .filter((p: any) => p.source === dashSelectedModel)
        .map((p: any) => [p.teamName as string, p.projWins as number])
    )
  }, [dashProjectedData, dashSelectedModel])

  useEffect(() => {
    if (dashSelectedModel !== 'consensus' && dashAvailableModels.length > 0 && !dashAvailableModels.includes(dashSelectedModel)) {
      setDashSelectedModel('consensus')
    }
  }, [dashAvailableModels, dashSelectedModel])

  const dashActivePredictorLadder = dashProjectedTeamOrder

  const dashMemberConsensusData = useMemo(() => {
    if (!dashProjectedData?.projections?.length || (spotlightPredictions as MemberPrediction[]).length === 0) return []
    const projections = dashProjectedData.projections as any[]
    const models = [...new Set(projections.map((p: any) => p.source as string))]
    const ranksByModel: Record<string, Record<number, number>> = {}
    const scoresByModel: Record<string, Record<number, number>> = {}
    for (const model of models) {
      const modelLadder = projections
        .filter((p: any) => p.source === model)
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((p: any) => p.teamName as string)
      const scored = [...(spotlightPredictions as MemberPrediction[])]
        .map(mp => ({ userId: mp.userId, score: totalForMember(mp, modelLadder) }))
        .sort((a, b) => a.score - b.score)
      ranksByModel[model] = {}
      scoresByModel[model] = {}
      scored.forEach((entry, idx) => {
        ranksByModel[model][entry.userId] = idx + 1
        scoresByModel[model][entry.userId] = entry.score
      })
    }
    return (spotlightPredictions as MemberPrediction[])
      .map(mp => {
        const memberRanksByModel: Record<string, number> = {}
        const memberScoresByModel: Record<string, number> = {}
        for (const model of models) {
          memberRanksByModel[model] = ranksByModel[model][mp.userId] ?? (spotlightPredictions as MemberPrediction[]).length
          memberScoresByModel[model] = scoresByModel[model][mp.userId] ?? 999
        }
        const ranks = Object.values(memberRanksByModel)
        const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length
        const tally = {
          first: ranks.filter(r => r === 1).length,
          second: ranks.filter(r => r === 2).length,
          third: ranks.filter(r => r === 3).length,
          fourth: ranks.filter(r => r === 4).length,
          total: models.length,
        }
        return { userId: mp.userId, displayName: mp.displayName, avgRank, ranksByModel: memberRanksByModel, scoresByModel: memberScoresByModel, tally, models }
      })
      .sort((a, b) => a.avgRank - b.avgRank)
  }, [dashProjectedData, spotlightPredictions])

  const dashPredictorLeaderboard = useMemo(() => {
    if (dashActivePredictorLadder.length === 0 || (spotlightPredictions as MemberPrediction[]).length === 0) return []
    return [...(spotlightPredictions as MemberPrediction[])]
      .map(mp => ({
        userId: mp.userId,
        displayName: mp.displayName,
        simScore: totalForMember(mp, dashActivePredictorLadder),
        realScore: totalForMember(mp, aflTeams),
      }))
      .sort((a, b) => a.simScore - b.simScore)
  }, [dashActivePredictorLadder, spotlightPredictions, aflTeams])

  // Accept invite mutation
  const acceptInviteMutation = useMutation({
    mutationFn: (token: string) => api.post(`/competitions/invites/${token}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myInvites'] })
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
    }
  })

  // Decline invite mutation
  const declineInviteMutation = useMutation({
    mutationFn: (token: string) => api.post(`/competitions/invites/${token}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myInvites'] })
    }
  })

  // Create competition mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      api.post('/competitions', { seasonId, ...data }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      setActivePanel('none')
      setFormData({ name: '', description: '', isPublic: false })
      setCreateError('')
      if (response.data.competition?.id) {
        navigate(`/competition/${response.data.competition.id}`)
      }
    },
    onError: (err: any) => {
      setCreateError(err.response?.data?.error || 'Failed to create competition')
    }
  })

  // Join competition mutation
  const joinMutation = useMutation({
    mutationFn: () => api.post('/competitions/join', { joinCode }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      queryClient.invalidateQueries({ queryKey: ['myInvites'] })
      setActivePanel('none')
      setJoinCode('')
      setJoinError('')
      if (response.data.competition?.id) {
        navigate(`/competition/${response.data.competition.id}`)
      }
    },
    onError: (err: any) => {
      setJoinError(err.response?.data?.error || 'Invalid code. Please try again.')
    }
  })

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setCreateError('Competition name is required')
      return
    }
    createMutation.mutate(formData)
  }

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode.trim()) {
      setJoinError('Join code is required')
      return
    }
    joinMutation.mutate()
  }

  const handleCopyCode = (comp: Competition, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(comp.joinCode)
    setCopiedId(comp.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const togglePanel = (panel: 'create' | 'join') => {
    setActivePanel(prev => prev === panel ? 'none' : panel)
    setCreateError('')
    setJoinError('')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark Nav */}
      <nav className="bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-xs tracking-tight">AFL</span>
              </div>
              <span className="text-white font-bold text-lg tracking-wide">Ladder Predictor</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400 hidden sm:block">
                Hey, <span className="font-semibold text-white">{user?.displayName}</span>
              </span>
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="px-3 py-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-800 hover:border-emerald-600 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  🛡️ Admin
                </button>
              )}
              {FEATURE_FANTASY7_ENABLED && (
                <button
                  onClick={() => navigate('/fantasy/dashboard')}
                  className="px-3 py-1.5 text-sm font-medium text-blue-300 hover:text-blue-200 border border-blue-900 hover:border-blue-700 rounded-lg transition-colors"
                >
                  Fantasy 7
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* Pending Invites */}
        {(pendingInvites as PendingInvite[]).length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">{(pendingInvites as PendingInvite[]).length}</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Pending Invitations</h2>
            </div>
            <div className="space-y-2">
              {(pendingInvites as PendingInvite[]).map((invite) => (
                <div
                  key={invite.id}
                  className="bg-white rounded-2xl border border-purple-100 p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{invite.competitionName}</p>
                      <p className="text-sm text-slate-500">
                        Invited by <span className="font-semibold text-slate-700">{invite.invitedByName}</span>
                        {' · '}{formatDate(invite.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => acceptInviteMutation.mutate(invite.inviteToken)}
                      disabled={acceptInviteMutation.isPending || declineInviteMutation.isPending}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineInviteMutation.mutate(invite.inviteToken)}
                      disabled={acceptInviteMutation.isPending || declineInviteMutation.isPending}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Locked Banner or Cutoff Countdown ── */}
        {competitionLocked ? (
          <div className="mb-6 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-600">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-red-400">🔒 Competition locked</p>
                <p className="text-slate-300 text-sm font-medium">
                  The {seasonYear} AFL season is underway — good luck!
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/prediction/${seasonId}`)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-sm transition-colors"
            >
              View My Prediction
            </button>
          </div>
        ) : countdown ? (
          <div
            className={`mb-6 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 ${
              countdown.days === 0
                ? 'bg-red-50 border border-red-200'
                : countdown.days <= 2
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-emerald-50 border border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                countdown.days === 0 ? 'bg-red-500' : countdown.days <= 2 ? 'bg-amber-400' : 'bg-emerald-500'
              }`}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest ${
                  countdown.days === 0 ? 'text-red-600' : countdown.days <= 2 ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {countdown.days === 0 ? '⚠ Final hours!' : countdown.days <= 2 ? '⚡ Closing soon' : '⏰ Submission deadline'}
                </p>
                <p className="text-slate-700 text-sm font-medium">
                  Predictions close <span className="font-bold">Mon 10 March at midnight AEDT</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {[
                { v: countdown.days,    l: 'd' },
                { v: countdown.hours,   l: 'h' },
                { v: countdown.minutes, l: 'm' },
                { v: countdown.seconds, l: 's' },
              ].map(({ v, l }) => (
                <div key={l} className="text-center">
                  <p className={`text-2xl font-black tabular-nums ${
                    countdown.days === 0 ? 'text-red-600' : countdown.days <= 2 ? 'text-amber-600' : 'text-emerald-700'
                  }`}>
                    {String(v).padStart(2, '0')}
                  </p>
                  <p className="text-xs text-slate-500 font-semibold">{l}</p>
                </div>
              ))}
              <button
                onClick={() => navigate(`/prediction/${seasonId}`)}
                className={`ml-2 px-4 py-2 text-white font-bold rounded-xl text-sm transition-colors ${
                  countdown.days === 0
                    ? 'bg-red-500 hover:bg-red-600'
                    : countdown.days <= 2
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                Submit now
              </button>
            </div>
          </div>
        ) : null}

        {/* Quick Actions — Create/Join hidden during active season, re-appear after season ends */}
        <div className="grid gap-3 mb-8 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {(!competitionLocked || SEASON_OVER) && (
            <button
              onClick={() => togglePanel('create')}
              className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all ${
                activePanel === 'create'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${activePanel === 'create' ? 'bg-emerald-500' : 'bg-emerald-100'}`}>
                <svg className={`w-5 h-5 ${activePanel === 'create' ? 'text-white' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="font-bold text-slate-900 text-sm">Create</span>
              <span className="text-xs text-slate-400 mt-0.5">New competition</span>
            </button>
          )}

          {(!competitionLocked || SEASON_OVER) && (
            <button
              onClick={() => togglePanel('join')}
              className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all ${
                activePanel === 'join'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${activePanel === 'join' ? 'bg-emerald-500' : 'bg-slate-100'}`}>
                <svg className={`w-5 h-5 ${activePanel === 'join' ? 'text-white' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                </svg>
              </div>
              <span className="font-bold text-slate-900 text-sm">Join</span>
              <span className="text-xs text-slate-400 mt-0.5">Use a code</span>
            </button>
          )}

          <button
            onClick={() => navigate(`/prediction/${seasonId}`)}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/50 transition-all"
          >
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-sm">{competitionLocked ? 'My Ladder' : 'Predict'}</span>
            <span className="text-xs text-slate-400 mt-0.5">{competitionLocked ? 'View submission' : `Your ${seasonYear} ladder`}</span>
          </button>

          <button
            onClick={() => navigate('/leaderboard')}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 transition-all"
          >
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-sm">Leaderboard</span>
            <span className="text-xs text-slate-400 mt-0.5">Global rankings</span>
          </button>

          <button
            onClick={() => navigate('/settings')}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 transition-all"
          >
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-sm">Settings</span>
            <span className="text-xs text-slate-400 mt-0.5">Email & account</span>
          </button>
        </div>

        {/* Create Panel */}
        {activePanel === 'create' && (
          <div className="mb-6 bg-white rounded-2xl border border-emerald-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">Create a New Competition</h2>
            <form onSubmit={handleCreateSubmit}>
              {createError && (
                <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                  {createError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Competition Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. The Work Footy Tipping Group"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                    autoFocus
                    maxLength={80}
                  />
                  <p className="mt-1 text-xs text-slate-400">{formData.name.length}/80 characters</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Description <span className="text-slate-400 font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    placeholder="What's this competition about?"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition resize-none"
                    rows={2}
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={formData.isPublic}
                        onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                        className="sr-only"
                      />
                      <div className={`w-10 h-6 rounded-full transition-colors ${formData.isPublic ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.isPublic ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Make public</p>
                      <p className="text-xs text-slate-400">Anyone can find and join</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  type="submit"
                  disabled={createMutation.isPending || !formData.name.trim()}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Competition'}
                </button>
                <button
                  type="button"
                  onClick={() => { setActivePanel('none'); setCreateError('') }}
                  className="px-6 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Join Panel */}
        {activePanel === 'join' && (
          <div className="mb-6 bg-white rounded-2xl border border-emerald-200 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">Join a Competition</h2>
            <form onSubmit={handleJoinSubmit}>
              {joinError && (
                <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                  {joinError}
                </div>
              )}
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Join Code
                </label>
                <input
                  type="text"
                  placeholder="AB12CD34"
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-[0.25em] uppercase text-center text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  autoFocus
                  maxLength={8}
                />
                <p className="mt-1 text-xs text-slate-400">8-character code from a competition member</p>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  type="submit"
                  disabled={joinMutation.isPending || joinCode.length < 8}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
                >
                  {joinMutation.isPending ? 'Joining…' : 'Join Competition'}
                </button>
                <button
                  type="button"
                  onClick={() => { setActivePanel('none'); setJoinError('') }}
                  className="px-6 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Competitions List */}
        <div>
          <button
            onClick={() => setShowComps(v => !v)}
            className="flex items-center justify-between w-full mb-4 group"
          >
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest group-hover:text-slate-900 transition-colors">
              Your Competitions
            </h2>
            <div className="flex items-center gap-2">
              {(competitions as Competition[]).length > 0 && (
                <span className="text-xs text-slate-400 font-medium">
                  {(competitions as Competition[]).length} competition{(competitions as Competition[]).length !== 1 ? 's' : ''}
                </span>
              )}
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${showComps ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {!showComps ? null : isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
                  <div className="h-5 bg-slate-100 rounded-lg w-3/4 mb-3" />
                  <div className="h-4 bg-slate-50 rounded-lg w-1/2 mb-6" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-10 bg-slate-100 rounded-xl" />
                    <div className="h-10 bg-slate-100 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (competitions as Competition[]).length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-14 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                </svg>
              </div>
              <p className="text-slate-900 font-bold mb-1">No competitions yet</p>
              <p className="text-sm text-slate-500">Create one above, or join with a code from a friend</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(competitions as Competition[]).map((comp) => (
                <div
                  key={comp.id}
                  onClick={() => navigate(`/competition/${comp.id}`)}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group flex flex-col"
                >
                  {/* Card header */}
                  <div className="p-5 pb-4 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-emerald-700 transition-colors flex-1 min-w-0">
                        {comp.name}
                      </h3>
                      {comp.isPublic && (
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-600">
                          Public
                        </span>
                      )}
                    </div>
                    {comp.description && (
                      <p className="text-sm text-slate-400 line-clamp-1 mt-0.5">{comp.description}</p>
                    )}
                  </div>

                  {/* Stats row — members / score / rank */}
                  <div className="px-5 pb-4 grid grid-cols-3 gap-1 border-t border-slate-50 pt-3">
                    <div className="text-center">
                      <p className="text-xl font-black text-slate-900">{comp.memberCount ?? '—'}</p>
                      <p className="text-xs text-slate-400">
                        {comp.memberCount === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                    <div className="text-center border-x border-slate-50">
                      {comp.userScore !== null ? (
                        <>
                          <p className="text-xl font-black text-emerald-600">{comp.userScore}</p>
                          <p className="text-xs text-slate-400">pts</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-black text-slate-200">—</p>
                          <p className="text-xs text-slate-400">pts</p>
                        </>
                      )}
                    </div>
                    <div className="text-center">
                      {comp.userRank ? (
                        <>
                          <p className="text-xl font-black text-amber-500">#{comp.userRank}</p>
                          <p className="text-xs text-slate-400">rank</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-black text-slate-200">—</p>
                          <p className="text-xs text-slate-400">rank</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-5 pb-5 flex gap-2">
                    {!competitionLocked && !comp.userHasSubmitted && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/prediction/${seasonId}`) }}
                        className="flex-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        Submit Prediction
                      </button>
                    )}
                    {!competitionLocked && comp.userHasSubmitted && (
                      <button
                        onClick={(e) => handleCopyCode(comp, e)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                          copiedId === comp.id
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {copiedId === comp.id ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                            <span className="font-mono tracking-wide">{comp.joinCode}</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/competition/${comp.id}`) }}
                      className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Competition Spotlight (tabbed card) ── */}
        {competitionLocked && firstComp && (
          <div className="mt-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                {firstComp.name}
              </h2>
              <button
                onClick={() => navigate(`/competition/${firstComp.id}`)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
              >
                Full view →
              </button>
            </div>

            {/* Tabbed card */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Tab bar + subtitle */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500">
                    {dashView === 'compare' && "AFL ladder vs everyone's predictions — key variance highlighted"}
                    {dashView === 'spotlight' && 'Select a team to see where everyone placed them'}
                    {dashView === 'leaderboard' && 'Current competition standings — lower is better'}
                    {dashView === 'predictor' && 'Auto-predict using Squiggle models, or pick game results manually'}
                  </p>
                </div>
                <div className="flex-shrink-0 flex rounded-xl bg-slate-100 p-1 gap-1">
                  {(['compare', 'spotlight', 'leaderboard', 'predictor'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDashView(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${dashView === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {tab === 'compare' ? 'League Compare' : tab === 'spotlight' ? 'Spotlight' : tab === 'leaderboard' ? 'Leaderboard' : 'Predictor'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── LEAGUE COMPARE TAB ── */}
              {dashView === 'compare' && (
                <div>
                  {aflTeams.length === 0 || dashSortedPredictions.length === 0 ? (
                    <div className="px-5 py-12 text-center text-slate-400 text-sm">No data yet.</div>
                  ) : (
                    <>
                      {/* Zone legend */}
                      <div className="px-5 py-2 border-b border-slate-100 flex gap-3 flex-wrap">
                        {zoneConfig.map((z) => (
                          <div key={z.label} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${z.dot}`} />
                            <span className={`text-xs font-semibold ${z.text}`}>{z.label}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span className="text-xs text-amber-600 font-semibold">Key team</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        <table className="w-full border-collapse" style={{ minWidth: '520px' }}>
                          <thead>
                            <tr>
                              <th className="sticky left-0 z-10 bg-slate-900 h-12 px-3 text-left align-bottom pb-2" style={{ boxShadow: '3px 0 8px -3px rgba(0,0,0,0.1)', minWidth: '160px' }}>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AFL Ladder</span>
                              </th>
                              {dashSortedPredictions.map((mp) => {
                                const isMe = mp.userId === user?.id
                                const total = totalForMember(mp, aflTeams)
                                return (
                                  <th key={mp.userId} className={`h-12 px-2 align-bottom pb-2 border-l border-slate-100 ${isMe ? 'bg-emerald-50' : 'bg-slate-50'}`} style={{ minWidth: '5rem' }}>
                                    <span className="text-xs font-bold text-slate-900 block truncate">{mp.displayName}</span>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {isMe && <span className="text-[10px] font-semibold text-emerald-600">You ·</span>}
                                      <span className="text-[10px] text-slate-400 font-semibold">{total} pts</span>
                                    </div>
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {aflTeams.map((team, i) => {
                              const meta = getTeamMeta(team)
                              const zone = getZone(i)
                              const { allSame, isKeyTeam } = classifyTeam(team, dashSortedPredictions)
                              return (
                                <tr
                                  key={team}
                                  className={`border-b border-slate-100 cursor-pointer hover:brightness-95 transition-all ${allSame ? '' : isKeyTeam ? 'bg-amber-50/40' : ''}`}
                                  onClick={() => navigate(`/competition/${firstComp?.id}`)}
                                >
                                  <td
                                    className={`sticky left-0 z-10 h-11 px-2 ${allSame ? 'opacity-50' : ''}`}
                                    style={{
                                      boxShadow: '3px 0 8px -3px rgba(0,0,0,0.12)',
                                      backgroundColor: allSame ? '#f8fafc' : `${meta.primaryColor}12`,
                                      borderLeft: `4px solid ${meta.primaryColor}`,
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-black flex-shrink-0 ${posBadgeClass(i)}`}>{i + 1}</span>
                                      <div className="w-8 h-8 rounded-xl flex flex-col overflow-hidden shadow-sm flex-shrink-0" style={{ border: `1.5px solid ${meta.secondaryColor}40` }}>
                                        <div className="flex-1 flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>{meta.shortName}</div>
                                        <div className="h-1.5" style={{ backgroundColor: meta.secondaryColor }} />
                                      </div>
                                      <div className="min-w-0 hidden sm:block">
                                        <div className="flex items-center gap-1">
                                          <p className="font-semibold text-slate-900 text-xs truncate">{team}</p>
                                          {isKeyTeam && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                                        </div>
                                        <p className={`text-[10px] ${zone.text}`}>{zone.label}</p>
                                      </div>
                                    </div>
                                  </td>
                                  {dashSortedPredictions.map((mp) => {
                                    const isMe = mp.userId === user?.id
                                    const { predictedPos, diff, points } = getScoreForMember(mp, team, aflTeams)
                                    const pts = points ?? 0
                                    let cellContent
                                    if (allSame) {
                                      cellContent = <span className="text-[10px] text-slate-300">#{predictedPos}</span>
                                    } else if (pts === 0) {
                                      cellContent = <span className="text-xs font-black text-emerald-500">#{predictedPos}</span>
                                    } else {
                                      const arrow = diff !== null && diff < 0
                                        ? <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                                        : <svg className="w-2.5 h-2.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                                      cellContent = (
                                        <>
                                          <span className={`text-[10px] font-bold ${isKeyTeam ? 'text-slate-700' : 'text-slate-500'}`}>#{predictedPos}</span>
                                          <span className="flex items-center gap-px">
                                            {arrow}
                                            <span className={`${isKeyTeam ? 'font-black text-sm' : 'text-xs font-black'} ${ptsColorClass(pts)}`}>{pts}</span>
                                          </span>
                                        </>
                                      )
                                    }
                                    return (
                                      <td key={mp.userId} className={`h-11 text-center border-l border-slate-50 ${allSame ? '' : pts === 0 ? 'bg-emerald-50/50' : isMe ? 'bg-emerald-50/20' : ''}`}>
                                        <div className="flex items-center justify-center gap-1 px-1">{cellContent}</div>
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200">
                              <td className="sticky left-0 z-10 bg-slate-900 px-3 py-2" style={{ boxShadow: '3px 0 8px -3px rgba(0,0,0,0.1)' }}>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                              </td>
                              {dashSortedPredictions.map((mp) => {
                                const isMe = mp.userId === user?.id
                                const total = totalForMember(mp, aflTeams)
                                const best = Math.min(...dashSortedPredictions.map(m => totalForMember(m, aflTeams)))
                                return (
                                  <td key={mp.userId} className={`border-l border-slate-100 px-2 py-2 text-center ${isMe ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                                    <span className={`text-base font-black ${total === best ? 'text-emerald-600' : 'text-slate-900'}`}>{total}</span>
                                    <p className="text-[10px] text-slate-400">{total === best ? '🏆' : `+${total - best}`}</p>
                                  </td>
                                )
                              })}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-4 flex-wrap text-xs text-slate-400">
                        <span><span className="font-black text-emerald-500">#3</span> = correct</span>
                        <span className="text-slate-200">|</span>
                        <span>Lower pts = better</span>
                        <span className="text-slate-200">|</span>
                        <span className="text-slate-300">Grey = everyone agrees</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── TEAM SPOTLIGHT TAB ── */}
              {dashView === 'spotlight' && (
                <div>
                  {/* Team picker */}
                  <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
                    {aflTeams.map(team => {
                      const meta = getTeamMeta(team)
                      const isSelected = dashSpotlightTeam === team
                      return (
                        <button
                          key={team}
                          onClick={() => setDashSpotlightTeam(team)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                          style={isSelected ? {
                            backgroundColor: meta.primaryColor,
                            color: meta.textColor,
                            border: `1px solid ${meta.primaryColor}`,
                          } : { backgroundColor: '#f1f5f9', color: '#475569' }}
                        >
                          {meta.shortName}
                        </button>
                      )
                    })}
                  </div>
                  {dashSpotlightTeam && dashSpotlightRows.length > 0 ? (
                    <div>
                      {(() => {
                        const meta = getTeamMeta(dashSpotlightTeam)
                        const actualPos = aflTeams.indexOf(dashSpotlightTeam) + 1
                        return (
                          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3" style={{ backgroundColor: `${meta.primaryColor}10` }}>
                            <div className="w-9 h-9 rounded-xl flex flex-col overflow-hidden shadow-sm flex-shrink-0" style={{ border: `1.5px solid ${meta.secondaryColor}40` }}>
                              <div className="flex-1 flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>{meta.shortName}</div>
                              <div className="h-1.5" style={{ backgroundColor: meta.secondaryColor }} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{dashSpotlightTeam}</p>
                              <p className="text-xs text-slate-500">Currently #{actualPos} on the AFL ladder</p>
                            </div>
                          </div>
                        )
                      })()}
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <span>Member</span>
                        <span className="text-right w-20">Predicted</span>
                        <span className="text-right w-14">Actual</span>
                        <span className="text-right w-10">Diff</span>
                      </div>
                      {dashSpotlightRows.map(row => {
                        const isMe = row.userId === user?.id
                        const diffColor =
                          row.error === 0 ? 'text-emerald-600 bg-emerald-50' :
                          row.error <= 2 ? 'text-amber-600 bg-amber-50' :
                          row.error <= 5 ? 'text-orange-600 bg-orange-50' :
                          'text-red-600 bg-red-50'
                        return (
                          <div key={row.userId} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-5 py-2.5 border-b border-slate-50 items-center ${isMe ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <button onClick={() => navigate(`/ladder/${row.userId}`)} className="text-sm font-semibold text-slate-900 hover:text-emerald-700 truncate transition-colors text-left">
                                {row.displayName}
                              </button>
                              {isMe && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">You</span>}
                            </div>
                            <div className="text-right w-20"><span className="text-lg font-black text-slate-900">#{row.predictedPos}</span></div>
                            <div className="text-right w-14"><span className="text-sm font-semibold text-slate-500">#{row.actualPos}</span></div>
                            <div className="text-right w-10">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-black ${diffColor}`}>
                                {row.error === 0 ? 'ok' : `±${row.error}`}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      <div className="px-5 py-3 bg-slate-50 text-xs text-slate-400 text-center">
                        Predicted position vs current AFL standing
                      </div>
                    </div>
                  ) : (
                    <div className="px-5 py-12 text-center text-slate-400 text-sm">
                      {aflTeams.length === 0 ? 'AFL ladder data not yet available.' : 'Select a team above.'}
                    </div>
                  )}
                </div>
              )}

              {/* ── LEADERBOARD TAB ── */}
              {dashView === 'leaderboard' && (
                <div>
                  {spotlightLeaderboard.length === 0 ? (
                    <div className="px-5 py-12 text-center text-slate-400 text-sm">Scores will appear once the AFL season starts.</div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {spotlightLeaderboard.map((entry, idx) => {
                        const isMe = entry.userId === user?.id
                        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                        return (
                          <div key={entry.userId} className={`flex items-center gap-3 px-5 py-3 ${isMe ? 'bg-emerald-50/60' : 'hover:bg-slate-50'} transition-colors`}>
                            <div className="w-7 text-center flex-shrink-0">
                              {medal ? <span className="text-base">{medal}</span> : <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>}
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <button onClick={() => navigate(`/ladder/${entry.userId}`)} className="font-semibold text-slate-900 text-sm truncate hover:text-emerald-700 hover:underline transition-colors text-left">
                                {entry.displayName}
                              </button>
                              {isMe && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">You</span>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-base font-black text-slate-900">{entry.totalPoints}</span>
                              <span className="text-xs text-slate-400 ml-1">pts</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 text-center">Lower score = better prediction</div>
                </div>
              )}

              {/* ── PREDICTOR TAB ── */}
              {dashView === 'predictor' && (
                <div>
                  {(spotlightPredictions as MemberPrediction[]).length === 0 ? (
                    <div className="px-5 py-12 text-center text-slate-400 text-sm">No predictions submitted yet.</div>
                  ) : (
                    <>
                      {/* Mode toggle + model selector */}
                      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                        <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
                          <button
                            onClick={() => setDashPredictorMode('auto')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${dashPredictorMode === 'auto' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            Auto Predict
                          </button>
                          <button
                            onClick={() => setDashPredictorMode('games')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${dashPredictorMode === 'games' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            Game Picks
                          </button>
                        </div>
                        {dashPredictorMode === 'auto' && dashAvailableModels.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">View:</span>
                            <select
                              value={dashSelectedModel}
                              onChange={e => setDashSelectedModel(e.target.value)}
                              className="text-xs font-semibold rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="consensus">Consensus (all models)</option>
                              {dashAvailableModels.map(m => (
                                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)} only</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* ── GAME PICKS MODE: Full Season Simulator ── */}
                      {dashPredictorMode === 'games' && (
                        <FullSeasonSimulator
                          seasonYear={seasonYear}
                          aflLadderData={aflLadderData}
                          predictions={spotlightPredictions as MemberPrediction[]}
                          currentUserId={user?.id ?? null}
                        />
                      )}

                      {/* ── AUTO PREDICT MODE layout ── */}
                      {dashPredictorMode === 'auto' && (
                      <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-slate-100">
                        {/* Left: auto predict ladder or game pickers */}
                        <div className="flex-1 min-w-0 p-4 lg:p-5">
                          {/* AUTO PREDICT */}
                          {dashPredictorMode === 'auto' && (
                            <>
                              {dashProjectedLoading ? (
                                <div className="space-y-2">{[...Array(10)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
                              ) : dashProjectedTeamOrder.length === 0 ? (
                                <div className="py-8 text-center text-slate-400 text-sm">
                                  {dashAvailableModels.length === 0 ? 'Squiggle projections not yet available.' : 'Select a view above.'}
                                </div>
                              ) : dashSelectedModel === 'consensus' ? (
                                <>
                                  <p className="text-xs font-bold text-slate-600 mb-2">Consensus — {dashAvailableModels.length} models</p>
                                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                                    {dashConsensusData.map((d, i) => {
                                      const meta = getTeamMeta(d.teamName)
                                      return (
                                        <div key={d.teamName} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white last:border-0">
                                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black flex-shrink-0 ${posBadgeClass(i)}`}>{i + 1}</span>
                                          <div className="w-8 h-8 rounded-xl flex flex-col overflow-hidden shadow-sm flex-shrink-0" style={{ border: `1.5px solid ${meta.secondaryColor}40` }}>
                                            <div className="flex-1 flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>{meta.shortName}</div>
                                            <div className="h-1.5" style={{ backgroundColor: meta.secondaryColor }} />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <span className="text-xs font-semibold text-slate-900 block truncate">{d.teamName}</span>
                                            <span className="text-[10px] text-slate-400">avg #{d.avgRank.toFixed(1)}</span>
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {dashAvailableModels.map(model => {
                                              const rank = d.ranksByModel[model]
                                              if (rank == null) return null
                                              return (
                                                <span key={model} title={`${model}: #${rank}`} className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-black ${posBadgeClass(rank - 1)}`}>{rank}</span>
                                              )
                                            })}
                                          </div>
                                          <div className="flex-shrink-0 w-14 text-right">
                                            {d.zoneTallies.top4 > 0 && <span className="text-[10px] font-bold text-emerald-600">{d.zoneTallies.top4}/{d.zoneTallies.total} T4</span>}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs font-bold text-slate-600 mb-2">{dashSelectedModel} projected final ladder</p>
                                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                                    {dashProjectedTeamOrder.map((team, i) => {
                                      const meta = getTeamMeta(team)
                                      const zone = zoneConfig.find(z => i >= z.range[0] && i <= z.range[1])!
                                      return (
                                        <div key={team} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white last:border-0">
                                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black flex-shrink-0 ${posBadgeClass(i)}`}>{i + 1}</span>
                                          <div className="w-8 h-8 rounded-xl flex flex-col overflow-hidden shadow-sm flex-shrink-0" style={{ border: `1.5px solid ${meta.secondaryColor}40` }}>
                                            <div className="flex-1 flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>{meta.shortName}</div>
                                            <div className="h-1.5" style={{ backgroundColor: meta.secondaryColor }} />
                                          </div>
                                          <span className="flex-1 text-xs font-semibold text-slate-900 truncate">{team}</span>
                                          {dashProjectedWinsMap[team] && <span className="text-[10px] text-slate-400">{dashProjectedWinsMap[team]}W</span>}
                                          <span className={`text-[10px] font-semibold ${zone.text}`}>{zone.label}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                            </>
                          )}

                        </div>

                        {/* Right: consensus member panel OR projected leaderboard */}
                        <div className="lg:w-72 flex-shrink-0 p-4 lg:p-5">
                          {dashSelectedModel === 'consensus' ? (
                            <>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-bold text-slate-700">League Consensus</p>
                                <span className="text-[10px] text-slate-400">{dashMemberConsensusData[0]?.tally.total ?? 0} models</span>
                              </div>
                              {dashMemberConsensusData.length === 0 ? (
                                <div className="py-6 text-center text-slate-400 text-xs">No predictions yet</div>
                              ) : (
                                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                                  {dashMemberConsensusData.map((entry, idx) => {
                                    const isMe = entry.userId === user?.id
                                    const { first, second, third, fourth } = entry.tally
                                    return (
                                      <div key={entry.userId} className={`px-3 py-2.5 ${isMe ? 'bg-emerald-50/60' : 'bg-white'}`}>
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black flex-shrink-0 ${posBadgeClass(idx)}`}>{idx + 1}</span>
                                          <div className="flex-1 min-w-0">
                                            <span className={`text-xs font-semibold truncate block ${isMe ? 'text-emerald-800' : 'text-slate-900'}`}>{entry.displayName}</span>
                                            <span className="text-[10px] text-slate-400">avg #{entry.avgRank.toFixed(1)}</span>
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {first > 0 && <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-400 text-white text-[9px] font-black">🥇{first}</span>}
                                            {second > 0 && <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-300 text-white text-[9px] font-black">🥈{second}</span>}
                                            {third > 0 && <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-400 text-white text-[9px] font-black">🥉{third}</span>}
                                            {fourth > 0 && <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-black">4th×{fourth}</span>}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-wrap pl-8">
                                          {entry.models.map((model: string) => {
                                            const rank = entry.ranksByModel[model]
                                            const chipClass = rank === 1 ? 'bg-amber-400 text-white' : rank === 2 ? 'bg-slate-300 text-white' : rank === 3 ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-400'
                                            return (
                                              <span key={model} title={`${model}: #${rank}`} className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-black ${chipClass}`}>{rank}</span>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-bold text-slate-700 mb-3">
                                Projected Leaderboard
                              </p>
                              {dashPredictorLeaderboard.length === 0 ? (
                                <div className="py-6 text-center text-slate-400 text-xs">
                                  Select a model
                                </div>
                              ) : (
                                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                                  {dashPredictorLeaderboard.map((entry, idx) => {
                                    const isMe = entry.userId === user?.id
                                    const scoreDelta = entry.simScore - entry.realScore
                                    const bestSimScore = Math.min(...dashPredictorLeaderboard.map(e => e.simScore))
                                    return (
                                      <div key={entry.userId} className={`flex items-center gap-2 px-3 py-2.5 ${isMe ? 'bg-emerald-50/60' : 'bg-white'}`}>
                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black flex-shrink-0 ${posBadgeClass(idx)}`}>{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                          <span className={`text-xs font-semibold truncate block ${isMe ? 'text-emerald-800' : 'text-slate-900'}`}>{entry.displayName}</span>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                          <p className={`text-sm font-black ${entry.simScore === bestSimScore ? 'text-emerald-600' : 'text-slate-900'}`}>{entry.simScore}</p>
                                          {scoreDelta !== 0 && <p className={`text-[10px] font-bold ${scoreDelta < 0 ? 'text-emerald-600' : 'text-red-500'}`}>{scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}</p>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      )}
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── FINALS PREDICTOR (always visible) ── */}
        <div className="mt-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Finals Predictor</h2>
            <p className="text-xs text-slate-500 mt-0.5">Simulate the AFL finals using projected model seedings — see who wins and what it means for scores</p>
          </div>
          {dashConsensusData.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-400 text-sm">
              {dashProjectedLoading ? 'Loading model projections…' : 'Projection data unavailable.'}
            </div>
          ) : (
            <FinalsPredictor
              consensusLadder={dashConsensusData}
              predictions={spotlightPredictions as MemberPrediction[]}
              currentUserId={user?.id ?? null}
            />
          )}
        </div>
      </main>
    </div>
  )
}
