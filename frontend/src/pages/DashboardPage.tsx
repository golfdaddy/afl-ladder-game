import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
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

  // AFL current ladder — sorted by position ascending → array of team names
  const aflTeams: string[] = (() => {
    const teams = aflLadderData?.ladder?.teams
    if (!Array.isArray(teams) || teams.length === 0) return []
    return [...teams]
      .sort((a: any, b: any) => a.position - b.position)
      .map((t: any) => t.teamName)
  })()

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

        {/* ── Competition Spotlight (locked: show leaderboard + ladders for first comp) ── */}
        {competitionLocked && firstComp && (
          <div className="mt-8 space-y-6">
            <div className="flex items-center gap-3">
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

            {/* Leaderboard */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3 className="font-bold text-slate-900 text-sm">Leaderboard</h3>
                <span className="text-xs text-slate-400 ml-1">· lower is better</span>
              </div>
              {spotlightLeaderboard.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">
                  Scores will appear once the AFL season starts.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {spotlightLeaderboard.map((entry, idx) => {
                    const isMe = entry.userId === user?.id
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                    return (
                      <div key={entry.userId} className={`flex items-center gap-3 px-5 py-3 ${isMe ? 'bg-emerald-50/60' : 'hover:bg-slate-50'} transition-colors`}>
                        <div className="w-7 text-center flex-shrink-0">
                          {medal ? (
                            <span className="text-base">{medal}</span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/ladder/${entry.userId}`)}
                            className="font-semibold text-slate-900 text-sm truncate hover:text-emerald-700 hover:underline transition-colors text-left"
                          >
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
            </div>

            {/* Everyone's Ladders — horizontal scroll comparison */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                <span className="text-base">🔒</span>
                <h3 className="font-bold text-slate-900 text-sm">League Ladders</h3>
                <span className="text-xs text-slate-400">· scroll right to compare</span>
                {aflTeams.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium ml-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
                    = matches AFL Now
                  </span>
                )}
              </div>
              {spotlightPredictions.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-400 text-sm">No submissions found.</div>
              ) : (
                <div className="flex">
                  {/* ── LEFT: sticky position # + AFL Now columns ── */}
                  <div
                    className="flex-shrink-0 z-10 bg-white"
                    style={{ boxShadow: '3px 0 8px -3px rgba(0,0,0,0.15)' }}
                  >
                    <div className="flex">
                      {/* Position # column */}
                      <div className="w-10 flex flex-col">
                        <div className="h-14 flex items-end pb-3 px-2 border-b border-slate-100 bg-white">
                          <span className="text-xs font-bold text-slate-400">#</span>
                        </div>
                        {Array.from({ length: 18 }, (_, i) => {
                          const pos = i + 1
                          const zoneClass =
                            pos <= 4  ? 'bg-emerald-50/80' :
                            pos <= 8  ? 'bg-blue-50/50' :
                            pos <= 14 ? 'bg-white' :
                                        'bg-red-50/50'
                          return (
                            <div key={pos} className={`h-9 flex items-center justify-end pr-2 border-b border-slate-50 ${zoneClass}`}>
                              <span className="text-xs font-black text-slate-400">{pos}</span>
                            </div>
                          )
                        })}
                      </div>
                      {/* AFL Now column */}
                      {aflTeams.length > 0 && (
                        <div className="w-32 flex flex-col bg-slate-900">
                          <div className="h-14 flex flex-col justify-end px-3 pb-3 border-b border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">AFL</p>
                            <p className="text-xs font-bold text-white leading-none">Now</p>
                          </div>
                          {aflTeams.map((team, i) => (
                            <div key={i} className={`h-9 flex items-center px-3 border-b border-slate-800 ${i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/60'}`}>
                              <span className="text-xs font-semibold text-white truncate">{team}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── RIGHT: scrollable user columns ── */}
                  <div className="overflow-x-auto flex-1">
                    <div className="flex min-w-full">
                      {spotlightPredictions.map((mp) => {
                        const entry = (spotlightLeaderboard as LeaderboardEntry[]).find((l) => l.userId === mp.userId)
                        const isMe = mp.userId === user?.id
                        return (
                          <div key={mp.userId} className="flex-[1_0_9rem] border-l border-slate-100">
                            {/* Column header */}
                            <div className={`h-14 flex flex-col justify-end px-3 pb-3 border-b border-slate-100 ${isMe ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                              <button
                                onClick={() => navigate(`/ladder/${mp.userId}`)}
                                className="text-xs font-bold text-slate-900 truncate text-left hover:text-emerald-700 transition-colors"
                              >
                                {mp.displayName}
                              </button>
                              <div className="flex items-center gap-1 mt-0.5">
                                {isMe && <span className="text-[10px] font-semibold text-emerald-600">You</span>}
                                {entry?.totalPoints != null && (
                                  <span className="text-[10px] text-slate-400 font-semibold">
                                    {isMe ? '· ' : ''}{entry.totalPoints} pts
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Ladder rows */}
                            {mp.ladder.map((team, i) => {
                              const pos = i + 1
                              const aflIdx = aflTeams.length > 0 ? aflTeams.indexOf(team) : -1
                              const aflActualPos = aflIdx >= 0 ? aflIdx + 1 : null
                              const diff = aflActualPos !== null ? pos - aflActualPos : null
                              // diff > 0 → team doing better than predicted (up ↑)
                              // diff < 0 → team doing worse than predicted (down ↓)
                              // diff = 0 → perfect match ✓
                              const matchesAFL = diff === 0
                              const zoneClass =
                                pos <= 4  ? 'bg-emerald-50/60' :
                                pos <= 8  ? 'bg-blue-50/40' :
                                pos <= 14 ? 'bg-white' :
                                            'bg-red-50/30'
                              return (
                                <div
                                  key={i}
                                  className={`h-9 flex items-center px-2 border-b border-slate-50 ${matchesAFL ? 'bg-emerald-100' : zoneClass}`}
                                >
                                  <span className={`text-xs font-semibold truncate flex-1 min-w-0 ${matchesAFL ? 'text-emerald-700 font-bold' : 'text-slate-700'}`}>
                                    {team}
                                  </span>
                                  {diff === null ? null : diff === 0 ? (
                                    <svg className="w-3 h-3 text-emerald-500 flex-shrink-0 ml-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  ) : diff > 0 ? (
                                    <span className="flex-shrink-0 ml-1 flex items-center gap-px text-emerald-600">
                                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                                      </svg>
                                      <span className="text-[9px] font-black leading-none">{diff}</span>
                                    </span>
                                  ) : (
                                    <span className="flex-shrink-0 ml-1 flex items-center gap-px text-red-500">
                                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                      <span className="text-[9px] font-black leading-none">{Math.abs(diff)}</span>
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
