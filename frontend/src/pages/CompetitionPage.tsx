import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { COMPETITION_LOCKED } from '../config'

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
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

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
    enabled: COMPETITION_LOCKED,
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
                  {COMPETITION_LOCKED ? 'Competition is locked — view only' : `Last updated: ${formatDate(me.predictionUpdatedAt)}`}
                </p>
                <button
                  onClick={() => navigate('/prediction/1')}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
                >
                  {COMPETITION_LOCKED ? '👁 View My Ladder' : 'View / Edit Prediction'}
                </button>
              </div>
            ) : COMPETITION_LOCKED ? (
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
                  onClick={() => navigate('/prediction/1')}
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

        {/* ── Member Ladders (revealed after lockout) ── */}
        {COMPETITION_LOCKED && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                <span className="text-base">🔒</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Everyone's Ladder</h2>
                <p className="text-sm text-slate-500 mt-0.5">All submissions revealed — competition is closed</p>
              </div>
            </div>

            {memberPredictions.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">
                No submitted ladders found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {memberPredictions.map((mp) => (
                  <div key={mp.userId} className={`px-6 py-5 ${mp.userId === currentUser?.id ? 'bg-emerald-50/40' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-slate-500">
                            {mp.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(`/ladder/${mp.userId}`)}
                          className="font-bold text-slate-900 text-sm hover:text-emerald-700 hover:underline transition-colors"
                        >
                          {mp.displayName}
                        </button>
                        {mp.userId === currentUser?.id && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">You</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        Submitted {formatDate(mp.submittedAt)}
                      </span>
                    </div>
                    {/* Ladder positions in a compact grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {mp.ladder.map((teamName, idx) => {
                        const pos = idx + 1
                        const badgeClass =
                          pos <= 4 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                          pos <= 8 ? 'bg-blue-50 border-blue-200 text-blue-800' :
                          pos <= 14 ? 'bg-slate-50 border-slate-200 text-slate-600' :
                          'bg-red-50 border-red-200 text-red-700'
                        return (
                          <div key={pos} className={`flex items-center gap-1.5 border rounded-lg px-2 py-1 ${badgeClass}`}>
                            <span className="text-xs font-black w-4 flex-shrink-0">{pos}</span>
                            <span className="text-xs font-semibold truncate">{teamName.split(' ').pop()}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
