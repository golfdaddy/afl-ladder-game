import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { useCurrentSeason } from '../hooks/useCurrentSeason'

interface LeaderboardEntry {
  userId: number
  displayName: string
  totalPoints: number
  email: string
}

interface Member {
  id: number
  email: string
  displayName: string
  hasSubmitted: boolean
  submittedAt: string | null
  predictionUpdatedAt: string | null
}

interface PendingInvite {
  id: number
  email: string
  status: string
  invitedByName: string
  createdAt: string
  displayName: string
  hasSubmitted: boolean
  isInvite: boolean
}

interface Competition {
  id: number
  name: string
  description?: string
  isPublic: boolean
  joinCode: string
}

interface MemberPrediction {
  userId: number
  displayName: string
  submittedAt: string
  ladder: string[]
}

// ── AFL Team Colours & Helpers (matching PredictionPage) ─────────────────────

interface AFLTeamMeta {
  name: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  textColor: string
}

const AFL_TEAM_META: AFLTeamMeta[] = [
  { name: 'Melbourne',        shortName: 'MEL', primaryColor: '#041E42', secondaryColor: '#CC2031', textColor: '#FFFFFF' },
  { name: 'St Kilda',         shortName: 'STK', primaryColor: '#000000', secondaryColor: '#ED1C24', textColor: '#FFFFFF' },
  { name: 'Collingwood',      shortName: 'COL', primaryColor: '#000000', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Brisbane Lions',   shortName: 'BRL', primaryColor: '#69003B', secondaryColor: '#0055A3', textColor: '#FFFFFF' },
  { name: 'Port Adelaide',    shortName: 'PTA', primaryColor: '#008AAB', secondaryColor: '#000000', textColor: '#FFFFFF' },
  { name: 'Carlton',          shortName: 'CAR', primaryColor: '#001B2A', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'North Melbourne',  shortName: 'NTH', primaryColor: '#003C71', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'GWS Giants',       shortName: 'GWS', primaryColor: '#F15C22', secondaryColor: '#4A4F55', textColor: '#FFFFFF' },
  { name: 'Richmond',         shortName: 'RIC', primaryColor: '#000000', secondaryColor: '#FED102', textColor: '#FED102' },
  { name: 'Fremantle',        shortName: 'FRE', primaryColor: '#2E0854', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Essendon',         shortName: 'ESS', primaryColor: '#000000', secondaryColor: '#CC2031', textColor: '#CC2031' },
  { name: 'Adelaide Crows',   shortName: 'ADE', primaryColor: '#002654', secondaryColor: '#E21E31', textColor: '#FFD200' },
  { name: 'Gold Coast Suns',  shortName: 'GCS', primaryColor: '#CF2032', secondaryColor: '#F4B223', textColor: '#FFFFFF' },
  { name: 'Geelong',          shortName: 'GEE', primaryColor: '#001F3D', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Hawthorn',         shortName: 'HAW', primaryColor: '#4D2004', secondaryColor: '#FBBF15', textColor: '#FBBF15' },
  { name: 'Sydney Swans',     shortName: 'SYD', primaryColor: '#ED171F', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'West Coast Eagles',shortName: 'WCE', primaryColor: '#002B5C', secondaryColor: '#F2A900', textColor: '#F2A900' },
  { name: 'Western Bulldogs', shortName: 'WBD', primaryColor: '#014896', secondaryColor: '#E1251B', textColor: '#FFFFFF' },
]

const getTeamMeta = (name: string): AFLTeamMeta =>
  AFL_TEAM_META.find((t) => t.name === name) ?? {
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    primaryColor: '#334155',
    secondaryColor: '#ffffff',
    textColor: '#ffffff',
  }

const zoneConfig = [
  { label: 'Top 4',  positions: '1–4',   range: [0, 3],  text: 'text-emerald-600', dot: 'bg-emerald-500' },
  { label: 'Finals', positions: '5–10',  range: [4, 9],  text: 'text-blue-600',    dot: 'bg-blue-500'   },
  { label: 'Mid',    positions: '11–14', range: [10, 13],text: 'text-slate-500',   dot: 'bg-slate-400'  },
  { label: 'Bottom', positions: '15–18', range: [14, 17],text: 'text-red-500',     dot: 'bg-red-500'    },
]
const getZone = (i: number) => zoneConfig.find((z) => i >= z.range[0] && i <= z.range[1])!

function posBadgeClass(i: number) {
  if (i < 4)              return 'bg-emerald-500 text-white'
  if (i >= 4 && i < 10)  return 'bg-blue-100 text-blue-700'
  if (i >= 10 && i < 14) return 'bg-slate-100 text-slate-600'
  return 'bg-red-100 text-red-600'
}

function ptsColorClass(pts: number | null) {
  if (pts === 0) return 'text-emerald-500'
  if (pts !== null && pts <= 2) return 'text-emerald-600'
  if (pts !== null && pts <= 4) return 'text-amber-500'
  return 'text-red-500'
}

function classifyTeam(teamName: string, memberPredictions: MemberPrediction[]) {
  const positions = memberPredictions.map(m => m.ladder.indexOf(teamName) + 1)
  const allSame = positions.every(p => p === positions[0])
  const spread = Math.max(...positions) - Math.min(...positions)
  const isKeyTeam = spread >= 3
  return { allSame, isKeyTeam, spread }
}

function getScoreForMember(member: MemberPrediction, teamName: string, aflTeams: string[]) {
  const actualPos = aflTeams.indexOf(teamName) + 1
  const predIdx = member.ladder.indexOf(teamName)
  const predictedPos = predIdx >= 0 ? predIdx + 1 : null
  const diff = predictedPos !== null ? predictedPos - actualPos : null
  const points = diff !== null ? Math.abs(diff) : null
  return { predictedPos, diff, points }
}

function totalForMember(member: MemberPrediction, aflTeams: string[]) {
  return aflTeams.reduce((sum, team) => sum + (getScoreForMember(member, team, aflTeams).points || 0), 0)
}

function ScoreDiffBadge({ diff, points }: { diff: number | null; points: number | null }) {
  if (diff === null || points === null) {
    return <span className="text-xs text-slate-300 font-mono w-12 text-center">—</span>
  }
  if (diff === 0) {
    return (
      <span className="inline-flex items-center justify-center w-12 text-xs font-bold text-emerald-600">
        ✓ 0
      </span>
    )
  }
  if (diff < 0) {
    return (
      <span className="inline-flex items-center justify-center gap-0.5 w-12 text-xs font-bold text-emerald-600">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        </svg>
        {Math.abs(diff)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center gap-0.5 w-12 text-xs font-bold text-red-500">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
      {Math.abs(diff)}
    </span>
  )
}

const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) return (
    <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
      <span className="text-white font-black text-xs">1</span>
    </div>
  )
  if (rank === 2) return (
    <div className="w-8 h-8 rounded-full bg-slate-400 flex items-center justify-center flex-shrink-0">
      <span className="text-white font-black text-xs">2</span>
    </div>
  )
  if (rank === 3) return (
    <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
      <span className="text-white font-black text-xs">3</span>
    </div>
  )
  return (
    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
      <span className="text-slate-600 font-bold text-xs">{rank}</span>
    </div>
  )
}

export default function CompetitionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const { seasonId, isLocked: competitionLocked } = useCurrentSeason()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [ladderView, setLadderView] = useState<'ladder' | 'spotlight' | 'compare'>('compare')
  const [selectedTeam, setSelectedTeam] = useState<string>('')

  // Fetch competition details
  const { data: compData, isLoading: compLoading } = useQuery({
    queryKey: ['competition', id],
    queryFn: async () => {
      const response = await api.get(`/competitions/${id}`)
      return response.data
    }
  })

  // Fetch competition leaderboard
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['leaderboard', 'competition', id],
    queryFn: async () => {
      const response = await api.get(`/leaderboards/competition/${id}`)
      return response.data.leaderboard
    }
  })

  // Fetch all member predictions (only when locked — reveals everyone's submission)
  const { data: memberPredictionsData } = useQuery({
    queryKey: ['competition', id, 'predictions'],
    queryFn: async () => {
      const response = await api.get(`/competitions/${id}/predictions`)
      return response.data.predictions as MemberPrediction[]
    },
    enabled: competitionLocked,
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

  // Send invite mutation
  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      api.post(`/competitions/${id}/invite`, { email }),
    onSuccess: (response) => {
      setInviteSuccess(response.data.message)
      setInviteEmail('')
      setInviteError('')
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
      setTimeout(() => setInviteSuccess(''), 5000)
    },
    onError: (err: any) => {
      setInviteError(err.response?.data?.error || 'Failed to send invitation')
      setInviteSuccess('')
    }
  })

  const competition: Competition = compData?.competition
  const members: Member[] = compData?.members || []
  const pendingInvites: PendingInvite[] = compData?.pendingInvites || []
  const leaderboard: LeaderboardEntry[] = leaderboardData || []
  const memberPredictions: MemberPrediction[] = memberPredictionsData || []

  // AFL current ladder — sorted by position ascending → array of team names
  const aflTeams: string[] = (() => {
    const teams = aflLadderData?.ladder?.teams
    if (!Array.isArray(teams) || teams.length === 0) return []
    return [...teams]
      .sort((a: any, b: any) => a.position - b.position)
      .map((t: any) => t.teamName)
  })()

  // Auto-select the team with the highest positional variance when data loads
  useEffect(() => {
    if (aflTeams.length === 0 || memberPredictions.length === 0 || selectedTeam) return
    let highestVariance = -1
    let bestTeam = aflTeams[0]
    for (const team of aflTeams) {
      const positions = memberPredictions.map(mp => mp.ladder.indexOf(team) + 1)
      const mean = positions.reduce((a, b) => a + b, 0) / positions.length
      const variance = positions.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positions.length
      if (variance > highestVariance) { highestVariance = variance; bestTeam = team }
    }
    setSelectedTeam(bestTeam)
  }, [aflTeams, memberPredictions, selectedTeam])

  // Per-team spotlight: each member's predicted vs actual position
  const spotlightRows = useMemo(() => {
    if (!selectedTeam || aflTeams.length === 0 || memberPredictions.length === 0) return []
    const actualPos = aflTeams.indexOf(selectedTeam) + 1
    return memberPredictions
      .map(mp => {
        const predictedPos = mp.ladder.indexOf(selectedTeam) + 1
        const error = Math.abs(predictedPos - actualPos)
        const lbIdx = leaderboard.findIndex(l => l.userId === mp.userId)
        return {
          userId: mp.userId,
          displayName: mp.displayName,
          predictedPos,
          actualPos,
          error,
          leaderboardRank: lbIdx >= 0 ? lbIdx + 1 : null,
          totalPoints: leaderboard[lbIdx]?.totalPoints,
        }
      })
      .sort((a, b) => a.predictedPos - b.predictedPos)
  }, [selectedTeam, aflTeams, memberPredictions, leaderboard])

  // Current user's score breakdown — AFL ladder with predicted position & points per team
  const myScoreRows = useMemo(() => {
    if (aflTeams.length === 0 || memberPredictions.length === 0 || !currentUser) return []
    const myPrediction = memberPredictions.find(mp => mp.userId === currentUser.id)
    if (!myPrediction) return []

    return aflTeams.map((teamName, i) => {
      const actualPos = i + 1
      const predIdx = myPrediction.ladder.indexOf(teamName)
      const predictedPos = predIdx >= 0 ? predIdx + 1 : null
      const diff = predictedPos !== null ? predictedPos - actualPos : null
      const points = diff !== null ? Math.abs(diff) : null
      return { teamName, actualPos, predictedPos, diff, points }
    })
  }, [aflTeams, memberPredictions, currentUser])

  const myTotalScore = useMemo(() => {
    if (myScoreRows.length === 0) return null
    if (myScoreRows.some(r => r.points === null)) return null
    return myScoreRows.reduce((sum, r) => sum + (r.points ?? 0), 0)
  }, [myScoreRows])

  const myLeaderboardRank = useMemo(() => {
    if (!currentUser) return null
    const idx = leaderboard.findIndex(l => l.userId === currentUser.id)
    return idx >= 0 ? idx + 1 : null
  }, [leaderboard, currentUser])

  // Sorted members for league compare: current user first, then by total score
  const sortedPredictions = useMemo(() => {
    if (aflTeams.length === 0 || memberPredictions.length === 0) return []
    return [...memberPredictions].sort((a, b) => {
      if (a.userId === currentUser?.id) return -1
      if (b.userId === currentUser?.id) return 1
      return totalForMember(a, aflTeams) - totalForMember(b, aflTeams)
    })
  }, [memberPredictions, aflTeams, currentUser])

  const handleCopyCode = () => {
    if (competition) {
      navigator.clipboard.writeText(competition.joinCode)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) {
      setInviteError('Please enter an email address')
      return
    }
    inviteMutation.mutate(inviteEmail.trim())
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (compLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-slate-900 h-32" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 h-48 animate-pulse" />
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 h-64 animate-pulse" />
        </div>
      </div>
    )
  }

  if (!competition) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-900 font-bold text-lg mb-1">Competition not found</p>
          <p className="text-slate-500 text-sm mb-6">It may have been deleted or the link is invalid.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const submittedCount = members.filter(m => m.hasSubmitted).length
  const me = members.find(m => m.id === currentUser?.id)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark header */}
      <div className="bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors mt-0.5 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-1">Competition</p>
                <h1 className="text-2xl font-black text-white">{competition.name}</h1>
                {competition.description && (
                  <p className="mt-1 text-slate-400 text-sm">{competition.description}</p>
                )}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold mt-1 ${competition.isPublic ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-400'}`}>
              {competition.isPublic ? 'Public' : 'Private'}
            </span>
          </div>

          {/* Header stats strip */}
          <div className="mt-6 flex gap-6">
            <div>
              <p className="text-2xl font-black text-white">{members.length}</p>
              <p className="text-slate-500 text-xs mt-0.5">Members</p>
            </div>
            <div className="w-px bg-slate-800" />
            <div>
              <p className="text-2xl font-black text-emerald-400">{submittedCount}</p>
              <p className="text-slate-500 text-xs mt-0.5">Submitted</p>
            </div>
            {pendingInvites.length > 0 && (
              <>
                <div className="w-px bg-slate-800" />
                <div>
                  <p className="text-2xl font-black text-purple-400">{pendingInvites.length}</p>
                  <p className="text-slate-500 text-xs mt-0.5">Invited</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">

          {/* Invite Friends Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Invite Friends</h3>
            </div>

            {/* Email Invite */}
            <form onSubmit={handleSendInvite} className="mb-5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Send email invite
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value)
                    setInviteError('')
                  }}
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  {inviteMutation.isPending ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : 'Send'}
                </button>
              </div>
              {inviteError && (
                <p className="mt-2 text-xs text-red-600">{inviteError}</p>
              )}
              {inviteSuccess && (
                <p className="mt-2 text-xs text-emerald-600 font-medium">{inviteSuccess}</p>
              )}
            </form>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-white text-xs text-slate-400 uppercase tracking-wider font-semibold">or share code</span>
              </div>
            </div>

            {/* Join Code */}
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg tracking-[0.25em] text-center text-slate-900 font-bold">
                {competition.joinCode}
              </div>
              <button
                onClick={handleCopyCode}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                  copySuccess
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {copySuccess ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : 'Copy'}
              </button>
            </div>
          </div>

          {/* Stats Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Status</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2.5 border-b border-slate-50">
                <span className="text-sm text-slate-500">Total Members</span>
                <span className="font-bold text-slate-900">{members.length}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-50">
                <span className="text-sm text-slate-500">Ladders Submitted</span>
                <span className="font-bold text-emerald-600">{submittedCount} / {members.length}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-50">
                <span className="text-sm text-slate-500">Still Awaiting</span>
                <span className={`font-bold ${members.length - submittedCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                  {members.length - submittedCount}
                </span>
              </div>
              {pendingInvites.length > 0 && (
                <div className="flex justify-between items-center py-2.5 border-b border-slate-50">
                  <span className="text-sm text-slate-500">Pending Invites</span>
                  <span className="font-bold text-purple-600">{pendingInvites.length}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2.5">
                <span className="text-sm text-slate-500">Competition Type</span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${competition.isPublic ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                  {competition.isPublic ? 'Public' : 'Private'}
                </span>
              </div>
            </div>
          </div>

          {/* Your Prediction Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">Your Prediction</h3>
            </div>

            {!me ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-slate-200 rounded-full animate-pulse" />
                <p className="text-sm text-slate-400">Loading...</p>
              </div>
            ) : me.hasSubmitted ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                  <span className="text-sm font-semibold text-emerald-700">Prediction submitted ✓</span>
                </div>
                <p className="text-xs text-slate-400 mb-5">
                  {competitionLocked ? 'Competition is locked — view only' : `Last updated: ${formatDate(me.predictionUpdatedAt)}`}
                </p>
                <button
                  onClick={() => navigate(`/prediction/${seasonId}`)}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
                >
                  {competitionLocked ? '👁 View My Ladder' : 'View / Edit Prediction'}
                </button>
              </div>
            ) : competitionLocked ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 bg-red-400 rounded-full" />
                  <span className="text-sm font-semibold text-red-600">No submission</span>
                </div>
                <p className="text-xs text-slate-400">
                  The competition closed on March 10 without a submission from you.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-sm font-semibold text-amber-700">Not yet submitted</span>
                </div>
                <p className="text-xs text-slate-400 mb-5">
                  Submit before the March 10 cutoff!
                </p>
                <button
                  onClick={() => navigate(`/prediction/${seasonId}`)}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-colors"
                >
                  Submit My Prediction
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Members & Invites Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Members</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {submittedCount} of {members.length} have submitted
                {pendingInvites.length > 0 && ` · ${pendingInvites.length} invite${pendingInvites.length > 1 ? 's' : ''} pending`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {/* Actual members */}
                {members.map((member) => (
                  <tr
                    key={`member-${member.id}`}
                    className={`transition-colors ${member.id === currentUser?.id ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-slate-500">
                            {member.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-900 text-sm">{member.displayName}</span>
                        {member.id === currentUser?.id && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">You</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{member.email}</td>
                    <td className="px-6 py-4 text-center">
                      {member.hasSubmitted ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-slate-400">
                      {member.hasSubmitted ? formatDate(member.predictionUpdatedAt) : '—'}
                    </td>
                  </tr>
                ))}

                {/* Pending invites */}
                {pendingInvites.map((invite) => (
                  <tr key={`invite-${invite.id}`} className="bg-purple-50/30 hover:bg-purple-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="font-semibold text-slate-400 text-sm italic">{invite.email.split('@')[0]}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{invite.email}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                        Invited
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-slate-400">
                      Sent {formatDate(invite.createdAt)}
                    </td>
                  </tr>
                ))}

                {members.length === 0 && pendingInvites.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                      No members yet. Share the join code above!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Leaderboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">Scores update when the AFL ladder is refreshed · Lower is better</p>
          </div>

          {leaderboardLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-slate-900 font-bold mb-1">No scores yet</p>
              <p className="text-slate-500 text-sm">Scores will appear once the AFL season starts and ladder data is uploaded.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                    entry.userId === currentUser?.id
                      ? 'bg-emerald-50/60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <RankBadge rank={index + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/ladder/${entry.userId}`)}
                        className="font-semibold text-slate-900 text-sm truncate hover:text-emerald-700 hover:underline transition-colors text-left"
                      >
                        {entry.displayName}
                      </button>
                      {entry.userId === currentUser?.id && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">You</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-black text-slate-900">{entry.totalPoints}</p>
                    <p className="text-xs text-slate-400">pts</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scoring note */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              Lower score = better prediction · Each team scored by |predicted − actual| position
            </p>
          </div>
        </div>

        {/* ── League Compare — directly below leaderboard ── */}
        {competitionLocked && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Header + tab switcher */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-900">
                  {ladderView === 'compare' ? 'League Compare' : ladderView === 'ladder' ? 'My Score' : 'Team Spotlight'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {ladderView === 'compare' && 'AFL ladder vs everyone\u2019s predictions — tap a team for detail'}
                  {ladderView === 'ladder' && 'AFL ladder vs your prediction — lower is better'}
                  {ladderView === 'spotlight' && 'Select a team to see where everyone placed them'}
                </p>
              </div>
              <div className="flex-shrink-0 flex rounded-xl bg-slate-100 p-1 gap-1">
                <button
                  onClick={() => setLadderView('compare')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${ladderView === 'compare' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  League Compare
                </button>
                <button
                  onClick={() => setLadderView('ladder')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${ladderView === 'ladder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  My Score
                </button>
                <button
                  onClick={() => setLadderView('spotlight')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${ladderView === 'spotlight' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Team Spotlight
                </button>
              </div>
            </div>

            {/* ── League Compare view ── */}
            {ladderView === 'compare' && (
              <div>
                {aflTeams.length === 0 || sortedPredictions.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-400 text-sm">
                    {aflTeams.length === 0 ? 'AFL ladder data not yet available.' : 'No predictions submitted yet.'}
                  </div>
                ) : (
                  <>
                    {/* Zone + key legend */}
                    <div className="px-5 py-2.5 border-b border-slate-100 flex gap-4 flex-wrap items-center">
                      {zoneConfig.map((z) => (
                        <div key={z.label} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${z.dot}`} />
                          <span className={`text-xs font-semibold ${z.text}`}>{z.label}</span>
                          <span className="text-xs text-slate-400">{z.positions}</span>
                        </div>
                      ))}
                    </div>

                    {/* Scrollable comparison table */}
                    <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                      <table className="w-full border-collapse" style={{ minWidth: '600px' }}>
                        <thead>
                          <tr>
                            <th className="sticky left-0 z-10 bg-slate-900 h-14 px-3 text-left align-bottom pb-2" style={{ boxShadow: '3px 0 8px -3px rgba(0,0,0,0.1)', minWidth: '180px' }}>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AFL Ladder</span>
                            </th>
                            {sortedPredictions.map((mp) => {
                              const isMe = mp.userId === currentUser?.id
                              const total = totalForMember(mp, aflTeams)
                              return (
                                <th key={mp.userId} className={`h-14 px-2 align-bottom pb-2 border-l border-slate-100 ${isMe ? 'bg-emerald-50' : 'bg-slate-50'}`} style={{ minWidth: '5.5rem' }}>
                                  <span className="text-xs font-bold text-slate-900 block truncate">{mp.displayName}</span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {isMe && <span className="text-[10px] font-semibold text-emerald-600">You</span>}
                                    {isMe && <span className="text-[10px] text-slate-400">·</span>}
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
                            const { allSame, isKeyTeam } = classifyTeam(team, sortedPredictions)
                            const rowBg = allSame ? 'bg-slate-50/60' : isKeyTeam ? 'bg-amber-50/40' : ''

                            return (
                              <tr key={team} className={`border-b border-slate-100 cursor-pointer hover:brightness-95 transition-all ${rowBg}`} onClick={() => { setSelectedTeam(team); setLadderView('spotlight') }}>
                                {/* Sticky AFL column */}
                                <td
                                  className={`sticky left-0 z-10 h-12 px-2 ${allSame ? 'opacity-50' : ''}`}
                                  style={{
                                    boxShadow: '3px 0 8px -3px rgba(0,0,0,0.12)',
                                    backgroundColor: allSame ? '#f8fafc' : `${meta.primaryColor}12`,
                                    borderLeft: `4px solid ${meta.primaryColor}`,
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-black flex-shrink-0 ${posBadgeClass(i)}`}>{i + 1}</span>
                                    {/* Two-tone badge: primary bg, secondary accent bottom strip */}
                                    <div
                                      className="w-9 h-9 rounded-xl flex flex-col overflow-hidden shadow-sm flex-shrink-0"
                                      style={{ border: `1.5px solid ${meta.secondaryColor}40` }}
                                    >
                                      <div
                                        className="flex-1 flex items-center justify-center text-[9px] font-black"
                                        style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}
                                      >
                                        {meta.shortName}
                                      </div>
                                      <div className="h-1.5" style={{ backgroundColor: meta.secondaryColor }} />
                                    </div>
                                    <div className="min-w-0 hidden sm:block">
                                      <div className="flex items-center gap-1.5">
                                        <p className="font-semibold text-slate-900 text-xs leading-tight truncate">{team}</p>
                                        {isKeyTeam && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                                      </div>
                                      <p className={`text-[10px] ${zone.text}`}>{zone.label}</p>
                                    </div>
                                  </div>
                                </td>

                                {/* Member cells */}
                                {sortedPredictions.map((mp) => {
                                  const isMe = mp.userId === currentUser?.id
                                  const { predictedPos, diff, points } = getScoreForMember(mp, team, aflTeams)
                                  const pts = points ?? 0

                                  let cellContent
                                  if (allSame) {
                                    cellContent = <span className="text-[10px] text-slate-300">#{predictedPos}</span>
                                  } else if (pts === 0) {
                                    cellContent = <span className="text-xs font-black text-emerald-500">#{predictedPos}</span>
                                  } else {
                                    const arrow = diff !== null && diff < 0 ? (
                                      <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                                    ) : (
                                      <svg className="w-2.5 h-2.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                                    )
                                    cellContent = (
                                      <>
                                        <span className={`text-[10px] ${isKeyTeam ? 'font-bold text-slate-700' : 'font-bold text-slate-500'}`}>#{predictedPos}</span>
                                        <span className="flex items-center gap-px">
                                          {arrow}
                                          <span className={`${isKeyTeam ? 'font-black text-sm' : 'text-xs font-black'} ${ptsColorClass(pts)}`}>{pts}</span>
                                        </span>
                                      </>
                                    )
                                  }

                                  const cellBg = allSame ? '' : pts === 0 ? 'bg-emerald-50/50' : isMe ? 'bg-emerald-50/20' : ''
                                  return (
                                    <td key={mp.userId} className={`h-12 text-center border-l border-slate-50 ${cellBg}`}>
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
                            <td className="sticky left-0 z-10 bg-slate-900 px-3 py-3" style={{ boxShadow: '3px 0 8px -3px rgba(0,0,0,0.1)' }}>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                            </td>
                            {sortedPredictions.map((mp) => {
                              const isMe = mp.userId === currentUser?.id
                              const total = totalForMember(mp, aflTeams)
                              const best = Math.min(...sortedPredictions.map(m => totalForMember(m, aflTeams)))
                              return (
                                <td key={mp.userId} className={`border-l border-slate-100 px-2 py-3 text-center ${isMe ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                                  <span className={`text-lg font-black ${total === best ? 'text-emerald-600' : 'text-slate-900'}`}>{total}</span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{total === best ? 'Leading!' : `+${total - best}`}</p>
                                </td>
                              )
                            })}
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-5 flex-wrap text-xs text-slate-400">
                      <span><span className="font-black text-emerald-500">#3</span> = correct position</span>
                      <span className="text-slate-200">|</span>
                      <span>Points = |predicted − actual| · lower is better</span>
                      <span className="text-slate-200">|</span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        <span className="font-semibold text-amber-600">Key team</span> = 3+ positions apart
                      </span>
                      <span className="text-slate-200">|</span>
                      <span className="text-slate-300">Grey row</span> = everyone agrees
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── My Score view ── */}
            {ladderView === 'ladder' && (
              <div>
                {myScoreRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-400 text-sm">
                    {aflTeams.length === 0
                      ? 'AFL ladder data not yet available.'
                      : 'No prediction submitted — scores will appear once you have a submission.'}
                  </div>
                ) : (
                  <>
                    {/* Score summary banner */}
                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your score</p>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-3xl font-black text-slate-900">
                            {myTotalScore !== null ? myTotalScore : '—'}
                          </span>
                          <span className="text-sm text-slate-400 font-medium">points</span>
                          {myLeaderboardRank && (
                            <span className="text-xs text-slate-400">
                              · Rank #{myLeaderboardRank} of {leaderboard.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="text-center">
                          <p className="text-lg font-black text-emerald-600">
                            {myScoreRows.filter(r => r.diff === 0).length}
                          </p>
                          <p className="text-xs text-slate-400">perfect</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-black text-emerald-600">
                            {myScoreRows.filter(r => r.diff !== null && r.diff < 0).length}
                          </p>
                          <p className="text-xs text-slate-400">↑ over</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-black text-red-500">
                            {myScoreRows.filter(r => r.diff !== null && r.diff > 0).length}
                          </p>
                          <p className="text-xs text-slate-400">↓ under</p>
                        </div>
                      </div>
                    </div>

                    {/* Zone legend */}
                    <div className="px-5 py-2.5 border-b border-slate-100 flex gap-4 flex-wrap">
                      {zoneConfig.map((z) => (
                        <div key={z.label} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${z.dot}`} />
                          <span className={`text-xs font-semibold ${z.text}`}>{z.label}</span>
                          <span className="text-xs text-slate-400">{z.positions}</span>
                        </div>
                      ))}
                    </div>

                    {/* Column headers */}
                    <div className="grid grid-cols-[2.5rem_1fr_2.5rem_3rem_2.5rem] items-center px-4 py-2.5 bg-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-widest">
                      <div className="text-center">AFL</div>
                      <div className="pl-2">Team</div>
                      <div className="text-center">My</div>
                      <div className="text-center">Move</div>
                      <div className="text-center">Pts</div>
                    </div>

                    {/* Team rows — ordered by actual AFL position */}
                    <div className="divide-y divide-slate-50">
                      {myScoreRows.map((row) => {
                        const meta = getTeamMeta(row.teamName)
                        const zone = getZone(row.actualPos - 1)
                        const pts = row.points

                        return (
                          <div
                            key={row.teamName}
                            className={`grid grid-cols-[2.5rem_1fr_2.5rem_3rem_2.5rem] items-center px-4 py-2.5 ${
                              pts === 0 ? 'bg-emerald-50/40' : ''
                            }`}
                          >
                            {/* AFL actual position */}
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${posBadgeClass(row.actualPos - 1)}`}>
                                {row.actualPos}
                              </span>
                            </div>

                            {/* Team badge + name */}
                            <div className="flex items-center gap-2.5 pl-2 min-w-0">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-sm flex-shrink-0"
                                style={{
                                  backgroundColor: meta.primaryColor,
                                  color: meta.textColor,
                                  border: meta.primaryColor === '#000000' ? '1px solid #333' : 'none',
                                }}
                              >
                                {meta.shortName}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{row.teamName}</p>
                                <p className={`text-xs ${zone.text}`}>{zone.label}</p>
                              </div>
                            </div>

                            {/* My predicted position */}
                            <div className="flex justify-center">
                              {row.predictedPos !== null ? (
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${posBadgeClass(row.predictedPos - 1)}`}>
                                  {row.predictedPos}
                                </span>
                              ) : (
                                <span className="w-7 text-center text-xs text-slate-300">—</span>
                              )}
                            </div>

                            {/* Diff arrow */}
                            <div className="flex justify-center">
                              <ScoreDiffBadge diff={row.diff} points={pts} />
                            </div>

                            {/* Points */}
                            <div className="flex justify-center">
                              <span className={`text-sm font-black ${
                                pts === 0 ? 'text-emerald-500' :
                                pts !== null && pts <= 2 ? 'text-emerald-600' :
                                pts !== null && pts <= 4 ? 'text-amber-500' :
                                'text-red-500'
                              }`}>
                                {pts !== null ? pts : '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Footer key */}
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-5 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                        Predicted higher than actual
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7 7" />
                        </svg>
                        Predicted lower than actual
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Team Spotlight view ── */}
            {ladderView === 'spotlight' && (
              <div>
                {/* Team picker — with team colours */}
                <div className="px-6 py-4 border-b border-slate-100">
                  <div className="flex flex-wrap gap-2">
                    {aflTeams.map(team => {
                      const meta = getTeamMeta(team)
                      const isSelected = selectedTeam === team
                      return (
                        <button
                          key={team}
                          onClick={() => setSelectedTeam(team)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                          style={isSelected ? {
                            backgroundColor: meta.primaryColor,
                            color: meta.textColor,
                            border: meta.primaryColor === '#000000' ? '1px solid #333' : `1px solid ${meta.primaryColor}`,
                          } : {
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                          }}
                        >
                          {meta.shortName}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Spotlight table */}
                {selectedTeam && spotlightRows.length > 0 ? (
                  <div>
                    {/* Selected team header */}
                    {(() => {
                      const meta = getTeamMeta(selectedTeam)
                      const actualPos = aflTeams.indexOf(selectedTeam) + 1
                      return (
                        <div
                          className="px-6 py-4 border-b border-slate-100 flex items-center gap-3"
                          style={{ backgroundColor: `${meta.primaryColor}10` }}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm flex-shrink-0"
                            style={{
                              backgroundColor: meta.primaryColor,
                              color: meta.textColor,
                              border: meta.primaryColor === '#000000' ? '1px solid #333' : 'none',
                            }}
                          >
                            {meta.shortName}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{selectedTeam}</p>
                            <p className="text-xs text-slate-500">Currently #{actualPos} on the AFL ladder</p>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-6 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <span>Member</span>
                      <span className="text-right w-20">Predicted</span>
                      <span className="text-right w-16">Actual</span>
                      <span className="text-right w-12">Diff</span>
                    </div>
                    {spotlightRows.map(row => {
                      const isMe = row.userId === currentUser?.id
                      const diffColor =
                        row.error === 0 ? 'text-emerald-600 bg-emerald-50' :
                        row.error <= 2 ? 'text-amber-600 bg-amber-50' :
                        row.error <= 5 ? 'text-orange-600 bg-orange-50' :
                        'text-red-600 bg-red-50'
                      return (
                        <div
                          key={row.userId}
                          className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-6 py-3 border-b border-slate-50 items-center ${isMe ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                        >
                          {/* Member name + rank */}
                          <div className="flex items-center gap-2 min-w-0">
                            {row.leaderboardRank != null && (
                              <RankBadge rank={row.leaderboardRank} />
                            )}
                            <div className="min-w-0">
                              <button
                                onClick={() => navigate(`/ladder/${row.userId}`)}
                                className="text-sm font-semibold text-slate-900 hover:text-emerald-700 truncate transition-colors text-left block"
                              >
                                {row.displayName}
                              </button>
                              {row.totalPoints != null && (
                                <span className="text-xs text-slate-400">{row.totalPoints} pts total</span>
                              )}
                            </div>
                            {isMe && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">You</span>
                            )}
                          </div>

                          {/* Predicted position */}
                          <div className="text-right w-20">
                            <span className="text-lg font-black text-slate-900">#{row.predictedPos}</span>
                          </div>

                          {/* Actual position */}
                          <div className="text-right w-16">
                            <span className="text-sm font-semibold text-slate-500">#{row.actualPos}</span>
                          </div>

                          {/* Diff badge */}
                          <div className="text-right w-12">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-black ${diffColor}`}>
                              {row.error === 0 ? '✓' : `±${row.error}`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    <div className="px-6 py-3 bg-slate-50 text-xs text-slate-400 text-center">
                      Predicted position vs current AFL standing · ✓ = exact match
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-12 text-center text-slate-400 text-sm">
                    {aflTeams.length === 0 ? 'AFL ladder data not yet available.' : 'Select a team above.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
