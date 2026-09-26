import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { FantasyCompetition, FantasyLeaderboardEntry, FantasyRound } from '../types/fantasy'

interface Member {
  id: number
  email: string
  displayName: string
  memberRole: 'member' | 'league_admin'
  joinedAt: string
}

interface PendingInvite {
  id: number
  email: string
  status: 'pending' | 'accepted' | 'declined'
}

export default function FantasyCompetitionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteError, setInviteError] = useState('')

  const competitionId = Number(id)

  const { data, isLoading } = useQuery({
    queryKey: ['fantasy-competition', competitionId],
    queryFn: async () => {
      const response = await api.get(`/fantasy/competitions/${competitionId}`)
      return response.data as {
        competition: FantasyCompetition
        members: Member[]
        pendingInvites: PendingInvite[]
        currentUserMemberRole: 'member' | 'league_admin' | null
      }
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
    queryKey: ['fantasy-leaderboard-weekly', competitionId, currentRound?.id],
    queryFn: async () => {
      const response = await api.get(`/fantasy/leaderboards/competition/${competitionId}`, {
        params: currentRound?.id ? { roundId: currentRound.id } : {},
      })
      return (response.data.leaderboard || []) as FantasyLeaderboardEntry[]
    },
    enabled: Number.isFinite(competitionId),
  })

  const { data: seasonLeaderboard = [] } = useQuery({
    queryKey: ['fantasy-leaderboard-season', competitionId],
    queryFn: async () => {
      const response = await api.get(`/fantasy/leaderboards/season/${competitionId}`)
      return (response.data.leaderboard || []) as FantasyLeaderboardEntry[]
    },
    enabled: Number.isFinite(competitionId),
  })

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/fantasy/competitions/${competitionId}/invite`, {
        email: inviteEmail,
      })
      return response.data
    },
    onSuccess: (result) => {
      setInviteMessage(result.message || 'Invite sent')
      setInviteError('')
      setInviteEmail('')
      queryClient.invalidateQueries({ queryKey: ['fantasy-competition', competitionId] })
    },
    onError: (error: any) => {
      setInviteError(error.response?.data?.error || 'Failed to send invite')
      setInviteMessage('')
    },
  })

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading fantasy competition…</div>
  }

  if (!data?.competition) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold text-slate-900">Competition not found</p>
          <button
            onClick={() => navigate('/fantasy/dashboard')}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            Back to Fantasy Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <button
            onClick={() => navigate('/fantasy/dashboard')}
            className="text-slate-400 hover:text-white text-sm font-semibold"
          >
            ← Fantasy Dashboard
          </button>
          <h1 className="text-white text-3xl font-black mt-2">{data.competition.name}</h1>
          <p className="text-slate-400 mt-2 text-sm">
            Rounds {data.competition.startRound}–{data.competition.endRound} • Join code {data.competition.joinCode}
          </p>
          {currentRound && (
            <div className="mt-4 flex gap-3">
              <Link
                to={`/fantasy/team/${competitionId}/${currentRound.id}`}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"
              >
                Set Team for Round {currentRound.roundNo}
              </Link>
              <Link
                to={`/fantasy/leaderboard/${competitionId}`}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold"
              >
                Full Leaderboard
              </Link>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Members</h2>
          <div className="space-y-2">
            {data.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between py-2 border-b border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{member.displayName}</p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                  {member.memberRole}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            {currentRound ? `Weekly Leaderboard (R${currentRound.roundNo})` : 'Weekly Leaderboard'}
          </h2>
          {weeklyLeaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No weekly results yet.</p>
          ) : (
            <div className="space-y-2">
              {weeklyLeaderboard.map((entry) => (
                <div key={entry.userId} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">#{entry.rank} {entry.displayName}</p>
                    <p className="text-xs text-slate-500">Salary used ${entry.salaryUsed}</p>
                  </div>
                  <p className="text-sm font-black text-emerald-600">{entry.points.toFixed(1)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Invite Friends</h2>
          <div className="space-y-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value)
                setInviteError('')
                setInviteMessage('')
              }}
              placeholder="friend@example.com"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:opacity-50"
            >
              {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
            </button>
            {inviteMessage && <p className="text-xs text-emerald-600">{inviteMessage}</p>}
            {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-700 mb-2">Pending Invites</h3>
            {data.pendingInvites.length === 0 ? (
              <p className="text-xs text-slate-500">No pending invites.</p>
            ) : (
              <div className="space-y-2">
                {data.pendingInvites.map((invite) => (
                  <div key={invite.id} className="text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    {invite.email}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Season Leaderboard</h2>
          {seasonLeaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No season results yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {seasonLeaderboard.map((entry) => (
                <div key={`season-${entry.userId}`} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">#{entry.rank} {entry.displayName}</p>
                  <p className="text-xs text-slate-500 mt-1">Salary total ${entry.salaryUsed}</p>
                  <p className="text-base font-black text-emerald-600 mt-1">{entry.points.toFixed(1)} pts</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
