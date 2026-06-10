import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { getTeamMeta } from '../utils/aflTeams'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MarketGame {
  gameId: number
  round: number
  date: string | null
  venue: string | null
  homeTeam: string
  awayTeam: string
  homeOdds: number
  awayOdds: number
  locked: boolean
}

interface MarketRound {
  round: number
  roundname: string
  games: MarketGame[]
}

type LegMarket = 'h2h' | 'disposals_ou' | 'anytime_goal'

interface SlipLeg {
  key: string
  gameId: number
  market: LegMarket
  label: string // main display line
  sublabel: string // matchup / context
  odds: number
  chipTeam: string // team whose colours to show
  selection?: string // h2h team
  playerId?: string
  side?: 'over' | 'under'
}

interface PropPlayer {
  playerId: string
  playerName: string
  team: string
  disposals: { line: number; overOdds: number; underOdds: number; avg: number } | null
  anytimeGoal: { odds: number; avg: number } | null
}

interface GamePropsData {
  gameId: number
  homeTeam: string
  awayTeam: string
  players: PropPlayer[]
}

interface BetLeg {
  id: number
  gameId: number
  gameRound: number
  gameDate: string | null
  selection: string
  opponent: string
  odds: number
  status: string
}

interface Bet {
  id: number
  stake: number
  totalOdds: number
  potentialPayout: number
  status: string
  payout: number | null
  placedAt: string
  legs: BetLeg[]
}

interface LeaderboardRow {
  userId: number
  displayName: string
  balance: number
  pendingBets: number
  pendingStake: number
  wonBets: number
  lostBets: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const money = (v: number) => `$${v.toFixed(2)}`

function statusChip(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-600',
    void: 'bg-slate-100 text-slate-500',
  }
  return map[status] || 'bg-slate-100 text-slate-500'
}

function TeamChip({ teamName }: { teamName: string }) {
  const meta = getTeamMeta(teamName)
  return (
    <div className="w-7 h-7 rounded-lg flex flex-col overflow-hidden shadow-sm flex-shrink-0" style={{ border: `1.5px solid ${meta.secondaryColor}40` }}>
      <div className="flex-1 flex items-center justify-center text-[8px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>
        {meta.shortName}
      </div>
      <div className="h-1" style={{ backgroundColor: meta.secondaryColor }} />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MultiPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const [view, setView] = useState<'markets' | 'bets' | 'leaderboard'>('markets')
  const [activeRound, setActiveRound] = useState<number | null>(null)
  const [slip, setSlip] = useState<SlipLeg[]>([])
  const [stakeInput, setStakeInput] = useState('10')
  const [placeError, setPlaceError] = useState('')
  const [placeSuccess, setPlaceSuccess] = useState('')
  const [propsGameId, setPropsGameId] = useState<number | null>(null)
  const [propsSearch, setPropsSearch] = useState('')

  const { data: accountData } = useQuery({
    queryKey: ['multi', 'account'],
    queryFn: () => api.get('/multi/account').then(r => r.data),
  })

  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ['multi', 'markets'],
    queryFn: () => api.get('/multi/markets').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: betsData } = useQuery({
    queryKey: ['multi', 'bets'],
    queryFn: () => api.get('/multi/bets').then(r => r.data),
    enabled: view === 'bets',
  })

  const { data: leaderboardData } = useQuery({
    queryKey: ['multi', 'leaderboard'],
    queryFn: () => api.get('/multi/leaderboard').then(r => r.data),
    enabled: view === 'leaderboard',
  })

  const { data: propsData, isLoading: propsLoading } = useQuery({
    queryKey: ['multi', 'props', propsGameId],
    queryFn: () => api.get(`/multi/markets/${propsGameId}/props`).then(r => r.data),
    enabled: propsGameId != null,
    staleTime: 5 * 60 * 1000,
  })
  const gameProps: GamePropsData | null = propsData?.props ?? null

  const balance: number = accountData?.account?.balance ?? 0
  const rounds: MarketRound[] = marketsData?.rounds ?? []
  const bets: Bet[] = betsData?.bets ?? []
  const leaderboard: LeaderboardRow[] = leaderboardData?.leaderboard ?? []

  const visibleRound = useMemo(() => {
    if (rounds.length === 0) return null
    return rounds.find(r => r.round === activeRound) || rounds[0]
  }, [rounds, activeRound])

  // ── Bet slip ───────────────────────────────────────────────────────────────

  // Combined odds with the same SGM haircut the server applies (0.9 per extra same-game leg)
  const slipOdds = useMemo(() => {
    const raw = slip.reduce((acc, l) => acc * l.odds, 1)
    const perGame = new Map<number, number>()
    for (const l of slip) perGame.set(l.gameId, (perGame.get(l.gameId) || 0) + 1)
    let factor = 1
    for (const count of perGame.values()) if (count > 1) factor *= Math.pow(0.9, count - 1)
    return Math.round(raw * factor * 1000) / 1000
  }, [slip])
  const hasSgm = useMemo(() => {
    const perGame = new Map<number, number>()
    for (const l of slip) perGame.set(l.gameId, (perGame.get(l.gameId) || 0) + 1)
    return [...perGame.values()].some(c => c > 1)
  }, [slip])
  const stake = parseFloat(stakeInput) || 0
  const estPayout = Math.round(stake * slipOdds * 100) / 100

  const clearMessages = () => { setPlaceError(''); setPlaceSuccess('') }

  const toggleLeg = (leg: SlipLeg, replaceKeys: string[] = []) => {
    clearMessages()
    setSlip(prev => {
      if (prev.some(l => l.key === leg.key)) return prev.filter(l => l.key !== leg.key)
      const without = prev.filter(l => !replaceKeys.includes(l.key))
      if (without.length >= 10) return without // server cap — silently ignore extras
      return [...without, leg]
    })
  }

  const toggleSelection = (game: MarketGame, selection: 'home' | 'away') => {
    const teamName = selection === 'home' ? game.homeTeam : game.awayTeam
    const opponent = selection === 'home' ? game.awayTeam : game.homeTeam
    const odds = selection === 'home' ? game.homeOdds : game.awayOdds
    toggleLeg(
      {
        key: `h2h:${game.gameId}:${teamName}`,
        gameId: game.gameId,
        market: 'h2h',
        label: teamName,
        sublabel: `vs ${opponent} · R${game.round}`,
        odds,
        chipTeam: teamName,
        selection: teamName,
      },
      [`h2h:${game.gameId}:${game.homeTeam}`, `h2h:${game.gameId}:${game.awayTeam}`]
    )
  }

  const toggleDisposals = (game: GamePropsData, player: PropPlayer, side: 'over' | 'under') => {
    if (!player.disposals) return
    toggleLeg(
      {
        key: `disposals_ou:${game.gameId}:${player.playerId}:${side}`,
        gameId: game.gameId,
        market: 'disposals_ou',
        label: `${player.playerName} ${side === 'over' ? 'O' : 'U'} ${player.disposals.line} disposals`,
        sublabel: `${game.homeTeam} v ${game.awayTeam}`,
        odds: side === 'over' ? player.disposals.overOdds : player.disposals.underOdds,
        chipTeam: player.team,
        playerId: player.playerId,
        side,
      },
      [`disposals_ou:${game.gameId}:${player.playerId}:over`, `disposals_ou:${game.gameId}:${player.playerId}:under`]
    )
  }

  const toggleAnytimeGoal = (game: GamePropsData, player: PropPlayer) => {
    if (!player.anytimeGoal) return
    toggleLeg({
      key: `anytime_goal:${game.gameId}:${player.playerId}`,
      gameId: game.gameId,
      market: 'anytime_goal',
      label: `${player.playerName} anytime goal`,
      sublabel: `${game.homeTeam} v ${game.awayTeam}`,
      odds: player.anytimeGoal.odds,
      chipTeam: player.team,
      playerId: player.playerId,
    })
  }

  const placeBetMutation = useMutation({
    mutationFn: () => api.post('/multi/bets', {
      stake,
      legs: slip.map(l => ({ gameId: l.gameId, market: l.market, selection: l.selection, playerId: l.playerId, side: l.side })),
    }),
    onSuccess: (response) => {
      setSlip([])
      setPlaceError('')
      setPlaceSuccess(`Bet placed — potential payout ${money(response.data.potentialPayout)}`)
      queryClient.invalidateQueries({ queryKey: ['multi'] })
    },
    onError: (err: any) => {
      setPlaceSuccess('')
      setPlaceError(err.response?.data?.error || 'Failed to place bet')
    },
  })

  const canPlace = slip.length > 0 && stake > 0 && stake <= balance && !placeBetMutation.isPending

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark Nav */}
      <nav className="bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-violet-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-xs tracking-tight">×</span>
              </div>
              <span className="text-white font-bold text-lg tracking-wide">Multi</span>
              <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-bold uppercase tracking-wide">Play money</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Balance</p>
                <p className="text-sm font-black text-emerald-400">{money(balance)}</p>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
              >
                ← Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* View tabs */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
            {(['markets', 'bets', 'leaderboard'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${view === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab === 'markets' ? 'Markets' : tab === 'bets' ? 'My Bets' : 'Leaderboard'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Fake cash, real bragging rights. Odds from Squiggle model probabilities.</p>
        </div>

        {/* ── MARKETS ── */}
        {view === 'markets' && (
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* Games list */}
            <div className="flex-1 min-w-0 w-full">
              {marketsLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
              ) : rounds.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 px-6 py-16 text-center text-slate-400 text-sm">
                  No upcoming games to bet on — check back when the next round is announced.
                </div>
              ) : (
                <>
                  {/* Round pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
                    {rounds.map(r => (
                      <button
                        key={r.round}
                        onClick={() => setActiveRound(r.round)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${visibleRound?.round === r.round ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        {r.roundname || `Round ${r.round}`}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {visibleRound?.games.map(game => {
                      const pickedH2h = slip.find(l => l.market === 'h2h' && l.gameId === game.gameId)
                      const propLegsForGame = slip.filter(l => l.market !== 'h2h' && l.gameId === game.gameId).length
                      const isExpanded = propsGameId === game.gameId
                      return (
                        <div key={game.gameId} className={`bg-white rounded-2xl border overflow-hidden ${game.locked ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
                          <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400">
                              {game.date ? new Date(game.date).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'TBC'}
                              {game.venue ? ` — ${game.venue}` : ''}
                            </span>
                            {game.locked && <span className="text-[10px] font-bold text-red-400 uppercase">Started</span>}
                          </div>
                          <div className="flex">
                            {([['home', game.homeTeam, game.homeOdds], ['away', game.awayTeam, game.awayOdds]] as const).map(([side, team, odds]) => {
                              const isPicked = pickedH2h?.selection === team
                              return (
                                <button
                                  key={side}
                                  disabled={game.locked}
                                  onClick={() => toggleSelection(game, side)}
                                  className={`flex-1 flex items-center justify-between gap-2 px-4 py-3 transition-colors ${side === 'home' ? 'border-r border-slate-100' : ''} ${game.locked ? 'cursor-not-allowed' : isPicked ? 'bg-violet-50' : 'hover:bg-slate-50'}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <TeamChip teamName={team} />
                                    <span className={`text-sm font-semibold truncate ${isPicked ? 'text-violet-700' : 'text-slate-800'}`}>{team}</span>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-lg text-sm font-black flex-shrink-0 ${isPicked ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                    {odds.toFixed(2)}
                                  </span>
                                </button>
                              )
                            })}
                          </div>

                          {/* Player props toggle */}
                          {!game.locked && (
                            <button
                              onClick={() => { setPropsGameId(isExpanded ? null : game.gameId); setPropsSearch('') }}
                              className="w-full px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                              <span>
                                Player props — disposals &amp; goals
                                {propLegsForGame > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">{propLegsForGame} in slip</span>}
                              </span>
                              <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                            </button>
                          )}

                          {/* Props panel */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/60">
                              {propsLoading ? (
                                <div className="px-4 py-6 text-center text-slate-400 text-xs">Loading player markets…</div>
                              ) : !gameProps || gameProps.players.length === 0 ? (
                                <div className="px-4 py-6 text-center text-slate-400 text-xs">No player markets for this game yet.</div>
                              ) : (
                                <>
                                  <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder="Search player…"
                                      value={propsSearch}
                                      onChange={e => setPropsSearch(e.target.value)}
                                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                                    />
                                    <span className="text-[10px] text-slate-400">O/U = disposals · AGS = anytime goal</span>
                                  </div>
                                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                                    {gameProps.players
                                      .filter(p => !propsSearch || p.playerName.toLowerCase().includes(propsSearch.toLowerCase()))
                                      .map(player => {
                                        const overKey = `disposals_ou:${game.gameId}:${player.playerId}:over`
                                        const underKey = `disposals_ou:${game.gameId}:${player.playerId}:under`
                                        const agsKey = `anytime_goal:${game.gameId}:${player.playerId}`
                                        const inSlip = (k: string) => slip.some(l => l.key === k)
                                        return (
                                          <div key={player.playerId} className="px-4 py-2 flex items-center gap-2 bg-white">
                                            <TeamChip teamName={player.team} />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold text-slate-800 truncate">{player.playerName}</p>
                                              <p className="text-[10px] text-slate-400">
                                                {player.disposals ? `${player.disposals.avg} disp avg` : ''}
                                                {player.disposals && player.anytimeGoal ? ' · ' : ''}
                                                {player.anytimeGoal ? `${player.anytimeGoal.avg} gls avg` : ''}
                                              </p>
                                            </div>
                                            {player.disposals && (
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{player.disposals.line}</span>
                                                <button
                                                  onClick={() => toggleDisposals(gameProps, player, 'over')}
                                                  className={`px-2 py-1 rounded-lg text-[11px] font-black transition-colors ${inSlip(overKey) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                >
                                                  O {player.disposals.overOdds.toFixed(2)}
                                                </button>
                                                <button
                                                  onClick={() => toggleDisposals(gameProps, player, 'under')}
                                                  className={`px-2 py-1 rounded-lg text-[11px] font-black transition-colors ${inSlip(underKey) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                >
                                                  U {player.disposals.underOdds.toFixed(2)}
                                                </button>
                                              </div>
                                            )}
                                            {player.anytimeGoal && (
                                              <button
                                                onClick={() => toggleAnytimeGoal(gameProps, player)}
                                                className={`px-2 py-1 rounded-lg text-[11px] font-black flex-shrink-0 transition-colors ${inSlip(agsKey) ? 'bg-violet-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                              >
                                                AGS {player.anytimeGoal.odds.toFixed(2)}
                                              </button>
                                            )}
                                          </div>
                                        )
                                      })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Bet slip */}
            <div className="lg:w-80 w-full flex-shrink-0 lg:sticky lg:top-6">
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-900 flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Bet Slip</span>
                  <span className="text-xs text-slate-400">{slip.length} leg{slip.length === 1 ? '' : 's'}</span>
                </div>

                {slip.length === 0 ? (
                  <div className="px-4 py-10 text-center text-slate-400 text-xs">
                    Tap odds to add legs.<br />Mix match results with player props.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {slip.map(leg => (
                      <div key={leg.key} className="px-4 py-2.5 flex items-center gap-2">
                        <TeamChip teamName={leg.chipTeam} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{leg.label}</p>
                          <p className="text-[10px] text-slate-400 truncate">{leg.sublabel}</p>
                        </div>
                        <span className="text-xs font-black text-slate-700">{leg.odds.toFixed(2)}</span>
                        <button onClick={() => { clearMessages(); setSlip(prev => prev.filter(l => l.key !== leg.key)) }} className="text-slate-300 hover:text-red-400 text-sm font-bold px-1">×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="px-4 py-3 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Combined odds</span>
                    <span className="font-black text-slate-900">{slip.length > 0 ? slipOdds.toFixed(2) : '—'}</span>
                  </div>
                  {hasSgm && (
                    <p className="text-[10px] text-slate-400">Same-game legs are related, so combined odds take a haircut — just like the real SGM.</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-semibold flex-shrink-0">Stake $</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={stakeInput}
                      onChange={e => { setStakeInput(e.target.value); setPlaceError(''); setPlaceSuccess('') }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <div className="flex gap-1">
                      {[10, 25, 50].map(v => (
                        <button key={v} onClick={() => setStakeInput(String(v))} className="px-2 py-1.5 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500 hover:bg-slate-200">{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Potential payout</span>
                    <span className="font-black text-emerald-600">{slip.length > 0 && stake > 0 ? money(estPayout) : '—'}</span>
                  </div>
                  {stake > balance && <p className="text-[11px] text-red-500 font-semibold">Stake exceeds your balance ({money(balance)})</p>}
                  {placeError && <p className="text-[11px] text-red-500 font-semibold">{placeError}</p>}
                  {placeSuccess && <p className="text-[11px] text-emerald-600 font-semibold">{placeSuccess}</p>}
                  <button
                    disabled={!canPlace}
                    onClick={() => placeBetMutation.mutate()}
                    className={`w-full py-2.5 rounded-xl text-sm font-black transition-colors ${canPlace ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                  >
                    {placeBetMutation.isPending ? 'Placing…' : slip.length > 1 ? `Place ${slip.length}-Leg Multi` : 'Place Bet'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MY BETS ── */}
        {view === 'bets' && (
          <div className="max-w-3xl">
            {bets.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 px-6 py-16 text-center text-slate-400 text-sm">
                No bets yet — head to Markets and back yourself.
              </div>
            ) : (
              <div className="space-y-3">
                {bets.map(bet => (
                  <div key={bet.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${statusChip(bet.status)}`}>{bet.status}</span>
                        <span className="text-xs font-bold text-slate-600">{bet.legs.length}-leg {bet.legs.length > 1 ? 'multi' : 'single'} @ {bet.totalOdds.toFixed(2)}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{new Date(bet.placedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {bet.legs.map(leg => (
                        <div key={leg.id} className="px-4 py-2 flex items-center gap-2">
                          <TeamChip teamName={leg.selection} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{leg.selection} <span className="text-slate-400 font-normal">vs {leg.opponent}</span></p>
                            <p className="text-[10px] text-slate-400">Round {leg.gameRound}</p>
                          </div>
                          <span className="text-xs font-bold text-slate-600">{leg.odds.toFixed(2)}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${statusChip(leg.status)}`}>{leg.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Stake <span className="font-black text-slate-800">{money(bet.stake)}</span></span>
                      {bet.status === 'pending'
                        ? <span className="text-slate-500">Potential <span className="font-black text-emerald-600">{money(bet.potentialPayout)}</span></span>
                        : <span className="text-slate-500">Returned <span className={`font-black ${(bet.payout || 0) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(bet.payout || 0)}</span></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {view === 'leaderboard' && (
          <div className="max-w-2xl">
            {leaderboard.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 px-6 py-16 text-center text-slate-400 text-sm">
                No punters yet — place a bet to get on the board.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {leaderboard.map((row, idx) => {
                  const isMe = row.userId === user?.id
                  return (
                    <div key={row.userId} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-violet-50/60' : 'bg-white'}`}>
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black flex-shrink-0 ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-white' : idx === 2 ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isMe ? 'text-violet-800' : 'text-slate-900'}`}>{row.displayName}{isMe ? ' (you)' : ''}</p>
                        <p className="text-[10px] text-slate-400">
                          {row.wonBets}W · {row.lostBets}L{row.pendingBets > 0 ? ` · ${row.pendingBets} pending (${money(row.pendingStake)} in play)` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-black text-slate-900">{money(row.balance)}</span>
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
