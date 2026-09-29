import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import {
  FANTASY_SALARY_CAP,
  FANTASY_SLOTS,
  FantasyLineup,
  FantasyRoundPlayer,
  FantasySlotCode,
  SLOT_POSITION,
} from '../types/fantasy'

type SlotSelections = Record<FantasySlotCode, number | null>

const emptySelections: SlotSelections = {
  B1: null,
  B2: null,
  M1: null,
  M2: null,
  F1: null,
  F2: null,
  R1: null,
}

export default function FantasyTeamPage() {
  const { competitionId: competitionIdRaw, roundId: roundIdRaw } = useParams<{ competitionId: string; roundId: string }>()
  const competitionId = Number(competitionIdRaw)
  const roundId = Number(roundIdRaw)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selections, setSelections] = useState<SlotSelections>(emptySelections)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ['fantasy-players', competitionId, roundId],
    queryFn: async () => {
      const response = await api.get('/fantasy/players', {
        params: { competitionId, roundId },
      })
      return (response.data.players || []) as FantasyRoundPlayer[]
    },
    enabled: Number.isFinite(competitionId) && Number.isFinite(roundId),
  })

  const { data: lineup } = useQuery({
    queryKey: ['fantasy-lineup-me', competitionId, roundId],
    queryFn: async () => {
      try {
        const response = await api.get(`/fantasy/lineups/${competitionId}/${roundId}/me`)
        return response.data.lineup as FantasyLineup
      } catch (error: any) {
        if (error.response?.status === 404) return null
        throw error
      }
    },
    enabled: Number.isFinite(competitionId) && Number.isFinite(roundId),
  })

  useEffect(() => {
    if (!lineup) return
    const next: SlotSelections = { ...emptySelections }
    for (const slot of lineup.slots) {
      next[slot.slotCode] = slot.playerId
    }
    setSelections(next)
  }, [lineup])

  const playerMap = useMemo(() => {
    return new Map(players.map((player) => [player.playerId, player]))
  }, [players])

  const lockedBySlot = useMemo(() => {
    const now = new Date()
    const map = new Map<FantasySlotCode, boolean>()
    for (const slotCode of FANTASY_SLOTS) {
      const existingSlot = lineup?.slots.find((slot) => slot.slotCode === slotCode)
      if (existingSlot?.isLocked) {
        map.set(slotCode, true)
        continue
      }
      const selectedPlayerId = selections[slotCode]
      const selectedPlayer = selectedPlayerId ? playerMap.get(selectedPlayerId) : null
      const locked = selectedPlayer ? new Date(selectedPlayer.lockAt) <= now : false
      map.set(slotCode, locked)
    }
    return map
  }, [lineup?.slots, playerMap, selections])

  const selectedPlayerIds = useMemo(() => {
    return new Set<number>(Object.values(selections).filter((value): value is number => value !== null))
  }, [selections])

  const totalCost = useMemo(() => {
    let cost = 0
    for (const slotCode of FANTASY_SLOTS) {
      const playerId = selections[slotCode]
      if (!playerId) continue
      const player = playerMap.get(playerId)
      if (!player) continue
      cost += player.priceBucket
    }
    return cost
  }, [playerMap, selections])

  const canSubmit = useMemo(() => {
    const everySlotFilled = FANTASY_SLOTS.every((slotCode) => selections[slotCode] !== null)
    return everySlotFilled && totalCost <= FANTASY_SALARY_CAP
  }, [selections, totalCost])

  const submitMutation = useMutation({
    mutationFn: async () => {
      const slots = FANTASY_SLOTS.map((slotCode) => ({
        slotCode,
        playerId: selections[slotCode]!,
      }))
      const response = await api.put(`/fantasy/lineups/${competitionId}/${roundId}/me`, { slots })
      return response.data.lineup as FantasyLineup
    },
    onSuccess: () => {
      setSubmitError('')
      setSubmitSuccess('Lineup saved successfully')
      queryClient.invalidateQueries({ queryKey: ['fantasy-lineup-me', competitionId, roundId] })
      queryClient.invalidateQueries({ queryKey: ['fantasy-leaderboard-weekly', competitionId] })
    },
    onError: (error: any) => {
      setSubmitSuccess('')
      setSubmitError(error.response?.data?.error || 'Failed to save lineup')
    },
  })

  const optionsForSlot = (slotCode: FantasySlotCode) => {
    const requiredPosition = SLOT_POSITION[slotCode]
    return players.filter((player) => player.positions.includes(requiredPosition) && player.isAvailable)
  }

  const handleSlotChange = (slotCode: FantasySlotCode, playerId: number | null) => {
    setSubmitError('')
    setSubmitSuccess('')
    setSelections((prev) => ({
      ...prev,
      [slotCode]: playerId,
    }))
  }

  if (playersLoading) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading round players…</div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <button onClick={() => navigate(`/fantasy/competition/${competitionId}`)} className="text-slate-400 hover:text-white text-sm font-semibold">
            ← Back to Competition
          </button>
          <h1 className="text-white text-3xl font-black mt-2">Round Team Builder</h1>
          <p className="text-slate-400 text-sm mt-2">7 slots • Salary cap ${FANTASY_SALARY_CAP} • Rolling player locks</p>

          <div className="mt-4 bg-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300 font-semibold">Budget used</span>
              <span className={`font-black ${totalCost > FANTASY_SALARY_CAP ? 'text-red-400' : 'text-emerald-400'}`}>
                ${totalCost} / ${FANTASY_SALARY_CAP}
              </span>
            </div>
            <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${totalCost > FANTASY_SALARY_CAP ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, (totalCost / FANTASY_SALARY_CAP) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FANTASY_SLOTS.map((slotCode) => {
            const slotPlayers = optionsForSlot(slotCode)
            const selectedId = selections[slotCode]
            const selected = selectedId ? playerMap.get(selectedId) : null
            const locked = lockedBySlot.get(slotCode) || false

            return (
              <div key={slotCode} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    {slotCode} • {SLOT_POSITION[slotCode]}
                  </h2>
                  {locked ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Locked</span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Open</span>
                  )}
                </div>
                <select
                  value={selectedId ?? ''}
                  onChange={(e) => handleSlotChange(slotCode, e.target.value ? Number(e.target.value) : null)}
                  disabled={locked}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm disabled:opacity-70"
                >
                  <option value="">Select player</option>
                  {slotPlayers.map((player) => {
                    const usedInAnotherSlot = selectedPlayerIds.has(player.playerId) && selectedId !== player.playerId
                    return (
                      <option key={player.playerId} value={player.playerId} disabled={usedInAnotherSlot}>
                        {player.fullName} ({player.aflTeam}) • ${player.priceBucket} • Avg {player.avgScore.toFixed(1)}
                      </option>
                    )
                  })}
                </select>
                {selected && (
                  <p className="text-xs text-slate-500 mt-2">
                    Locks at {new Date(selected.lockAt).toLocaleString('en-AU')}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || submitMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitMutation.isPending ? 'Saving…' : lineup ? 'Update Lineup' : 'Submit Lineup'}
          </button>
          <Link to={`/fantasy/leaderboard/${competitionId}`} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            View Leaderboard
          </Link>
        </div>

        {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
        {submitSuccess && <p className="mt-3 text-sm text-emerald-600">{submitSuccess}</p>}
      </main>
    </div>
  )
}
