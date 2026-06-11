import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { getTeamMeta } from '../utils/aflTeams'
import { SevensLogo, SLOT_LABELS, SLOT_SHORT } from '../components/SevensBrand'
import { FreakCoin } from '../components/FreakbetBrand'

interface PoolPlayer {
  playerId: string
  playerName: string
  team: string
  positions: string[]
  avgPoints: number
  price: number
  last5: number[]
  last5Avg: number
  opponent: string | null
  isHome: boolean | null
}

/** Coin icon + amount — the Freakazoid price. */
function Price({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`inline-flex items-center gap-0.5 ${className}`}><FreakCoin size={13} />{value}</span>
}

/** This round's matchup: vs (home) / @ (away) + opponent abbreviation in their colours. */
function OpponentBadge({ player }: { player: PoolPlayer }) {
  if (!player.opponent) return <span className="text-[9px] font-black text-amber-600 bg-amber-50 rounded px-1 py-0.5">BYE</span>
  const meta = getTeamMeta(player.opponent)
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
      {player.isHome ? 'vs' : '@'}
      <span className="px-1 py-0.5 rounded text-[9px] font-black" style={{ backgroundColor: `${meta.primaryColor}1a`, color: meta.primaryColor }}>{meta.shortName}</span>
    </span>
  )
}

/** Season avg + last-5 avg (form trend) + the 5 scores, each coloured vs the player's average. */
function FormBits({ player }: { player: PoolPlayer }) {
  const hot = player.last5Avg - player.avgPoints
  const trend = Math.abs(hot) < 2 ? 'flat' : hot > 0 ? 'up' : 'down'
  return (
    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
      <span className="text-[10px] text-slate-400">Avg <span className="font-bold text-slate-600">{player.avgPoints}</span></span>
      <span className={`text-[10px] font-bold ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
        L5 {player.last5Avg}{trend === 'up' ? ' ▲' : trend === 'down' ? ' ▼' : ''}
      </span>
      {player.last5.length > 0 && (
        <span className="flex items-center gap-0.5">
          {player.last5.map((s, i) => {
            const above = s >= player.avgPoints
            return (
              <span key={i} className={`text-[9px] font-bold rounded px-1 py-0.5 tabular-nums ${above ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{s}</span>
            )
          })}
        </span>
      )}
    </div>
  )
}

interface TeamPlayer extends PoolPlayer {
  slot: string
  points: number | null
}

interface SevensRound {
  id: number
  round: number
  budget: number
  status: 'open' | 'locked' | 'scored'
  locksAt: string | null
}

// Formation expanded to slot instances in display order
function slotInstances(formation: Record<string, number>): string[] {
  const order = ['BACK', 'MID', 'RUCK', 'FWD']
  const slots: string[] = []
  for (const s of order) for (let i = 0; i < (formation[s] || 0); i++) slots.push(s)
  return slots
}

function PlayerChip({ team }: { team: string }) {
  const meta = getTeamMeta(team)
  return (
    <div className="w-7 h-7 rounded-lg flex flex-col overflow-hidden shadow-sm flex-shrink-0" style={{ border: `1.5px solid ${meta.secondaryColor}40` }}>
      <div className="flex-1 flex items-center justify-center text-[8px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>{meta.shortName}</div>
      <div className="h-1" style={{ backgroundColor: meta.secondaryColor }} />
    </div>
  )
}

export default function SevensPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [view, setView] = useState<'team' | 'leaderboard'>('team')
  const [picks, setPicks] = useState<(string | null)[]>([])
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [initialised, setInitialised] = useState(false)

  const { data: roundData } = useQuery({
    queryKey: ['sevens', 'round'],
    queryFn: () => api.get('/sevens/round').then(r => r.data),
  })

  const round: SevensRound | undefined = roundData?.round
  const formation: Record<string, number> = roundData?.formation || { BACK: 2, MID: 2, RUCK: 1, FWD: 2 }
  const pool: PoolPlayer[] = roundData?.pool || []
  const existingTeam: { players: TeamPlayer[] } | null = roundData?.team || null
  const slots = useMemo(() => slotInstances(formation), [formation])
  const poolById = useMemo(() => new Map(pool.map(p => [p.playerId, p])), [pool])

  // Seed picks from the saved team once the data lands
  if (!initialised && roundData) {
    const seeded: (string | null)[] = slots.map(() => null)
    if (existingTeam) {
      // place each saved player into the first matching empty slot
      const slotQueues: Record<string, number[]> = {}
      slots.forEach((s, i) => { (slotQueues[s] ||= []).push(i) })
      for (const tp of existingTeam.players) {
        const idx = slotQueues[tp.slot]?.shift()
        if (idx != null) seeded[idx] = tp.playerId
      }
    }
    setPicks(seeded)
    setInitialised(true)
  }

  const { data: lbData } = useQuery({
    queryKey: ['sevens', 'leaderboard'],
    queryFn: () => api.get('/sevens/leaderboard').then(r => r.data),
    enabled: view === 'leaderboard',
  })
  const leaderboard = lbData?.leaderboard || []

  const budget = round?.budget ?? 600
  const spent = useMemo(() => picks.reduce((s, pid) => s + (pid ? (poolById.get(pid)?.price || 0) : 0), 0), [picks, poolById])
  const remaining = budget - spent
  const filledCount = picks.filter(Boolean).length
  const locked = round?.status !== 'open'

  const pickedIds = useMemo(() => new Set(picks.filter(Boolean) as string[]), [picks])

  const eligibleForSlot = useMemo(() => {
    if (activeSlot == null) return []
    const slot = slots[activeSlot]
    return pool
      .filter(p => p.positions.includes(slot) && !pickedIds.has(p.playerId))
      .filter(p => !search || p.playerName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.price - a.price)
  }, [activeSlot, slots, pool, pickedIds, search])

  const saveMutation = useMutation({
    mutationFn: () => api.post('/sevens/team', {
      picks: picks.map((pid, i) => pid ? { playerId: pid, slot: slots[i] } : null).filter(Boolean),
    }),
    onSuccess: () => {
      setSaveMsg('Team saved! Locked in for the round.')
      queryClient.invalidateQueries({ queryKey: ['sevens'] })
    },
    onError: (err: any) => setSaveMsg(err.response?.data?.error || 'Failed to save team'),
  })

  const assignPlayer = (playerId: string) => {
    if (activeSlot == null) return
    setPicks(prev => prev.map((p, i) => i === activeSlot ? playerId : p))
    setActiveSlot(null)
    setSearch('')
    setSaveMsg('')
  }

  const clearSlot = (i: number) => { setPicks(prev => prev.map((p, j) => j === i ? null : p)); setSaveMsg('') }

  const canSave = filledCount === slots.length && remaining >= 0 && !locked && !saveMutation.isPending

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <SevensLogo size={34} />
              <span className="text-white font-black text-lg tracking-wide">SUPER SEVENS</span>
            </div>
            <div className="flex items-center gap-3">
              {round && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Round {round.round} · {locked ? 'Locked' : 'Budget'}</p>
                  {!locked && <p className={`text-sm font-black flex items-center justify-end gap-1 ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}><FreakCoin size={13} />{remaining} / {budget}</p>}
                </div>
              )}
              <button onClick={() => { logout(); navigate('/welcome') }} className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors">Sign out</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
            {(['team', 'leaderboard'] as const).map(t => (
              <button key={t} onClick={() => setView(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${view === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'team' ? 'My Team' : 'Leaderboard'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1 flex-wrap">Pick 2 defenders, 2 mids, 1 ruck, 2 forwards. <FreakCoin size={12} />{budget} Freakazoids — the elite cost <FreakCoin size={11} />10, fringe players <FreakCoin size={11} />1.</p>
        </div>

        {/* ── TEAM BUILDER ── */}
        {view === 'team' && (
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            <div className="flex-1 w-full">
              {locked && (
                <div className="mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                  Round {round?.round} is locked — teams are final. {round?.status === 'scored' ? 'Scores are in.' : 'Games are underway.'}
                </div>
              )}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                {slots.map((slot, i) => {
                  const pid = picks[i]
                  const player = pid ? poolById.get(pid) : null
                  const tp = existingTeam?.players.find(p => p.playerId === pid)
                  return (
                    <button
                      key={i}
                      disabled={locked}
                      onClick={() => { setActiveSlot(i); setSearch('') }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${activeSlot === i ? 'border-emerald-400 bg-emerald-50/40' : player ? 'border-slate-200' : 'border-dashed border-slate-300'} ${locked ? 'cursor-default' : 'hover:border-emerald-300'}`}
                    >
                      <span className="w-9 text-[10px] font-black text-slate-400 uppercase flex-shrink-0">{SLOT_SHORT[slot]}</span>
                      {player ? (
                        <>
                          <PlayerChip team={player.team} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <span className="truncate">{player.playerName}</span>
                              <OpponentBadge player={player} />
                              {locked && tp?.points != null ? <span className="text-[10px] font-black text-emerald-600 flex-shrink-0">scored {tp.points}</span> : null}
                            </p>
                            <FormBits player={player} />
                          </div>
                          <span className="text-sm font-black text-emerald-600 flex-shrink-0 self-start"><Price value={player.price} /></span>
                          {!locked && <span onClick={(e) => { e.stopPropagation(); clearSlot(i) }} className="text-slate-300 hover:text-red-400 font-bold px-1 self-start">×</span>}
                        </>
                      ) : (
                        <span className="flex-1 text-sm text-slate-400">Tap to pick a {SLOT_LABELS[slot].toLowerCase()}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Save bar */}
              {!locked && (
                <div className="mt-3 bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs">
                    <span className="text-slate-500">{filledCount}/{slots.length} picked · </span>
                    <span className={`inline-flex items-center gap-0.5 ${remaining < 0 ? 'text-red-500 font-bold' : 'text-slate-700 font-bold'}`}><FreakCoin size={12} />{remaining} of <FreakCoin size={12} />{budget} left</span>
                    {saveMsg && <span className="ml-2 text-emerald-600 font-semibold">{saveMsg}</span>}
                  </div>
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSave}
                    className={`px-5 py-2 rounded-xl text-sm font-black transition-colors ${canSave ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                  >
                    {saveMutation.isPending ? 'Saving…' : 'Save Team'}
                  </button>
                </div>
              )}
            </div>

            {/* Player picker */}
            <div className="lg:w-80 w-full flex-shrink-0">
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-950 flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{activeSlot != null ? `Pick a ${SLOT_LABELS[slots[activeSlot]]}` : 'Player Pool'}</span>
                  {activeSlot != null && <button onClick={() => setActiveSlot(null)} className="text-xs text-slate-400 hover:text-white">Close</button>}
                </div>
                {activeSlot == null ? (
                  <div className="px-4 py-10 text-center text-slate-400 text-xs">Tap a slot to choose a player.</div>
                ) : (
                  <>
                    <div className="px-3 pt-3">
                      <input type="text" placeholder="Search player…" value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100 mt-2">
                      {eligibleForSlot.map(p => {
                        const affordable = p.price <= remaining + (picks[activeSlot] ? (poolById.get(picks[activeSlot]!)?.price || 0) : 0)
                        return (
                          <button key={p.playerId} onClick={() => assignPlayer(p.playerId)} disabled={!affordable}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left ${affordable ? 'hover:bg-emerald-50' : 'opacity-40 cursor-not-allowed'}`}>
                            <PlayerChip team={p.team} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1.5">
                                <span className="truncate">{p.playerName}</span>
                                {p.positions.length > 1 && <span className="text-[9px] font-black text-slate-400 flex-shrink-0">{p.positions.join('/')}</span>}
                                <OpponentBadge player={p} />
                              </p>
                              <FormBits player={p} />
                            </div>
                            <span className="text-sm font-black text-emerald-600 flex-shrink-0 self-start"><Price value={p.price} /></span>
                          </button>
                        )
                      })}
                      {eligibleForSlot.length === 0 && <div className="px-4 py-8 text-center text-slate-400 text-xs">No players match.</div>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {view === 'leaderboard' && (
          <div className="max-w-2xl">
            {leaderboard.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 px-6 py-16 text-center text-slate-400 text-sm">No teams in yet — build yours.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {leaderboard.map((row: any, idx: number) => {
                  const isMe = row.userId === user?.id
                  return (
                    <div key={row.userId} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-emerald-50/60' : ''}`}>
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black flex-shrink-0 ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</span>
                      <span className={`flex-1 text-sm font-semibold truncate ${isMe ? 'text-emerald-800' : 'text-slate-900'}`}>{row.displayName}{isMe ? ' (you)' : ''}</span>
                      <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"><FreakCoin size={11} />{row.totalPrice}</span>
                      <span className="text-sm font-black text-slate-900">{row.score == null ? '—' : row.score}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
