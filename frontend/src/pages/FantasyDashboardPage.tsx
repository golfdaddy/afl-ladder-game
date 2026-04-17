import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { FantasyCompetition, FantasyRound } from '../types/fantasy'

export default function FantasyDashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startRound, setStartRound] = useState(1)
  const [endRound, setEndRound] = useState(24)
  const [joinCode, setJoinCode] = useState('')
  const [createError, setCreateError] = useState('')
  const [joinError, setJoinError] = useState('')

  const { data: competitions = [], isLoading } = useQuery({
    queryKey: ['fantasy-competitions'],
    queryFn: async () => {
      const response = await api.get('/fantasy/competitions')
      return (response.data.competitions || []) as FantasyCompetition[]
    },
  })

  const { data: invites = [] } = useQuery({
    queryKey: ['fantasy-invites-mine'],
    queryFn: async () => {
      const response = await api.get('/fantasy/competitions/invites/mine')
      return response.data.invites as Array<{
        id: number
        competitionId: number
        inviteToken: string
        competitionName: string
        invitedByName: string
      }>
    },
  })

  const firstCompetition = competitions[0]
  const { data: currentRound } = useQuery({
    queryKey: ['fantasy-current-round', firstCompetition?.id],
    queryFn: async () => {
      const response = await api.get('/fantasy/rounds/current', { params: { competitionId: firstCompetition.id } })
      return response.data.round as FantasyRound
    },
    enabled: !!firstCompetition,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/fantasy/competitions', {
        name,
        description,
        startRound,
        endRound,
      })
      return response.data.competition as FantasyCompetition
    },
    onSuccess: (competition) => {
      setName('')
      setDescription('')
      setCreateError('')
      queryClient.invalidateQueries({ queryKey: ['fantasy-competitions'] })
      navigate(`/fantasy/competition/${competition.id}`)
    },
    onError: (error: any) => {
      setCreateError(error.response?.data?.error || 'Failed to create competition')
    },
  })

  const joinMutation = useMutation({
    mutationFn: async () => {
      await api.post('/fantasy/competitions/join', { joinCode })
    },
    onSuccess: () => {
      setJoinCode('')
      setJoinError('')
      queryClient.invalidateQueries({ queryKey: ['fantasy-competitions'] })
    },
    onError: (error: any) => {
      setJoinError(error.response?.data?.error || 'Failed to join competition')
    },
  })

  const formatRoundWindow = (start: number, end: number) => `Rounds ${start}–${end}`

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Fantasy 7</p>
          <h1 className="text-white text-3xl font-black mt-1">Weekly Team Builder</h1>
          <p className="text-slate-400 mt-2 text-sm max-w-3xl">
            Pick 7 AFL players each round under a $25 cap. Rolling locks apply by player game start.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/dashboard" className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold hover:bg-slate-700">
              Back to Ladder Game
            </Link>
            {firstCompetition && currentRound && (
              <Link
                to={`/fantasy/team/${firstCompetition.id}/${currentRound.id}`}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"
              >
                Open Current Team Builder
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Create Competition</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Competition name"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={startRound}
                onChange={(e) => setStartRound(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
              <input
                type="number"
                min={1}
                max={30}
                value={endRound}
                onChange={(e) => setEndRound(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
              />
            </div>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !name.trim()}
              className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Competition'}
            </button>
            {createError && <p className="text-xs text-red-600">{createError}</p>}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Join Competition</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Join code"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm uppercase"
            />
            <button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending || !joinCode.trim()}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {joinMutation.isPending ? 'Joining…' : 'Join'}
            </button>
            {joinError && <p className="text-xs text-red-600">{joinError}</p>}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-700 mb-2">Pending Invites</h3>
            {invites.length === 0 ? (
              <p className="text-xs text-slate-500">No pending invites.</p>
            ) : (
              <div className="space-y-2">
                {invites.map((invite) => (
                  <Link
                    key={invite.id}
                    to={`/fantasy/invite/${invite.inviteToken}`}
                    className="block rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <p className="text-sm font-semibold text-slate-900">{invite.competitionName}</p>
                    <p className="text-xs text-slate-500">Invited by {invite.invitedByName}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 lg:col-span-1">
          <h2 className="text-lg font-bold text-slate-900 mb-4">My Competitions</h2>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : competitions.length === 0 ? (
            <p className="text-sm text-slate-500">No fantasy competitions yet.</p>
          ) : (
            <div className="space-y-3">
              {competitions.map((competition) => (
                <div key={competition.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold text-slate-900">{competition.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{formatRoundWindow(competition.startRound, competition.endRound)}</p>
                  <div className="mt-3 flex gap-2">
                    <Link
                      to={`/fantasy/competition/${competition.id}`}
                      className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
                    >
                      Open
                    </Link>
                    <Link
                      to={`/fantasy/leaderboard/${competition.id}`}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-100 text-emerald-700 font-semibold hover:bg-emerald-200"
                    >
                      Leaderboard
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
