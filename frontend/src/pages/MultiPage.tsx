import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { getTeamMeta } from '../utils/aflTeams'
import { FreakbetLogo, FreakCoin, freaks, FREAK_SYMBOL } from '../components/FreakbetBrand'

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

type LegMarket = 'h2h' | 'stat_plus'

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
  stat?: string
  threshold?: number
}

interface PropRung {
  stat: string
  threshold: number
  odds: number
}

interface PropPlayer {
  playerId: string
  playerName: string
  team: string
  listedPosition: string | null
  avgs: Record<string, number>
  rungs: PropRung[]
}

const POSITION_LABELS: Record<string, string> = {
  MIDFIELDER: 'MID',
  MIDFIELDER_FORWARD: 'MID/FWD',
  MEDIUM_FORWARD: 'FWD',
  KEY_FORWARD: 'KEY FWD',
  MEDIUM_DEFENDER: 'DEF',
  KEY_DEFENDER: 'KEY DEF',
  RUCK: 'RUCK',
}

const STAT_TABS: Array<{ key: string; label: string }> = [
  { key: 'disposals', label: 'Disposals' },
  { key: 'goals', label: 'Goals' },
  { key: 'marks', label: 'Marks' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'hitouts', label: 'Hitouts' },
]

const STAT_SHORT: Record<string, string> = {
  disposals: 'disposals',
  goals: 'goals',
  marks: 'marks',
  tackles: 'tackles',
  clearances: 'clearances',
  hitouts: 'hitouts',
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
  market: string
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
  compId: number | null
  compName: string | null
}

interface Comp {
  id: number
  name: string
  joinCode: string
  scopeType: 'game' | 'round'
  scopeRound: number
  scopeGameId: number | null
  buyIn: number
  startingBudget: number
  minBet: number | null
  maxBet: number | null
  mustSpend: boolean
  payoutRule: string
  status: string
  creatorUserId: number
  memberCount: number
  myBalance: number
  myStaked: number
  myPayout: number | null
  myRank: number | null
}

interface CompLeaderboardRow {
  userId: number
  displayName: string
  balance: number
  totalStaked: number
  score: number
  payout: number | null
  finalRank: number | null
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

const money = freaks

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
  const logout = useAuthStore((state) => state.logout)

  const [view, setView] = useState<'markets' | 'bets' | 'comps' | 'leaderboard'>('markets')
  const [betContext, setBetContext] = useState<number | 'main'>('main')
  const [expandedCompId, setExpandedCompId] = useState<number | null>(null)
  const [compForm, setCompForm] = useState({ name: '', scopeType: 'game' as 'game' | 'round', scopeGameId: '', buyIn: '50', startingBudget: '500', minBet: '', maxBet: '', mustSpend: false, payoutRule: 'winner_takes_all' })
  const [compMsg, setCompMsg] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [showCreateComp, setShowCreateComp] = useState(false)
  const [activeRound, setActiveRound] = useState<number | null>(null)
  const [slip, setSlip] = useState<SlipLeg[]>([])
  const [stakeInput, setStakeInput] = useState('10')
  const [placeError, setPlaceError] = useState('')
  const [placeSuccess, setPlaceSuccess] = useState('')
  const [propsGameId, setPropsGameId] = useState<number | null>(null)
  const [propsSearch, setPropsSearch] = useState('')
  const [propsTab, setPropsTab] = useState('disposals')

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

  // Live leg progress — refetched on demand, and auto every 60s while a game is live
  const { data: liveData, refetch: refetchLive, isFetching: liveFetching, dataUpdatedAt: liveUpdatedAt } = useQuery({
    queryKey: ['multi', 'bets', 'live'],
    queryFn: () => api.get('/multi/bets/live').then(r => r.data),
    enabled: view === 'bets',
    refetchInterval: (q: any) => (q?.state?.data?.anyLive ? 60_000 : false),
  })
  const liveByLeg = useMemo(() => {
    const map = new Map<number, any>()
    for (const l of (liveData?.legs ?? [])) map.set(l.legId, l)
    return map
  }, [liveData])
  const anyLive: boolean = liveData?.anyLive ?? false

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

  const { data: compsData } = useQuery({
    queryKey: ['multi', 'comps'],
    queryFn: () => api.get('/multi/comps').then(r => r.data),
  })
  const comps: Comp[] = compsData?.comps ?? []
  const openComps = comps.filter(c => c.status === 'open')
  const activeComp = betContext !== 'main' ? openComps.find(c => c.id === betContext) ?? null : null

  const { data: compLeaderboardData } = useQuery({
    queryKey: ['multi', 'comps', expandedCompId, 'leaderboard'],
    queryFn: () => api.get(`/multi/comps/${expandedCompId}/leaderboard`).then(r => r.data),
    enabled: expandedCompId != null,
  })
  const compLeaderboard: CompLeaderboardRow[] = compLeaderboardData?.leaderboard ?? []

  const createCompMutation = useMutation({
    mutationFn: () => api.post('/multi/comps', {
      name: compForm.name,
      scopeType: compForm.scopeType,
      scopeRound: compForm.scopeType === 'game'
        ? (rounds.flatMap(r => r.games).find(g => g.gameId === Number(compForm.scopeGameId))?.round ?? rounds[0]?.round)
        : rounds[0]?.round,
      scopeGameId: compForm.scopeType === 'game' ? Number(compForm.scopeGameId) : null,
      buyIn: Number(compForm.buyIn) || 0,
      startingBudget: Number(compForm.startingBudget) || 500,
      minBet: compForm.minBet ? Number(compForm.minBet) : null,
      maxBet: compForm.maxBet ? Number(compForm.maxBet) : null,
      mustSpend: compForm.mustSpend,
      payoutRule: compForm.payoutRule,
    }),
    onSuccess: (response) => {
      setCompMsg(`Comp created — share code ${response.data.joinCode}`)
      setShowCreateComp(false)
      queryClient.invalidateQueries({ queryKey: ['multi'] })
    },
    onError: (err: any) => setCompMsg(err.response?.data?.error || 'Failed to create comp'),
  })

  const joinCompMutation = useMutation({
    mutationFn: () => api.post('/multi/comps/join', { code: joinCode }),
    onSuccess: () => {
      setCompMsg('Joined! Bets in this comp use your comp wallet.')
      setJoinCode('')
      queryClient.invalidateQueries({ queryKey: ['multi'] })
    },
    onError: (err: any) => setCompMsg(err.response?.data?.error || 'Failed to join comp'),
  })

  const balance: number = accountData?.account?.balance ?? 0
  const rounds: MarketRound[] = marketsData?.rounds ?? []
  const bets: Bet[] = betsData?.bets ?? []
  const leaderboard: LeaderboardRow[] = leaderboardData?.leaderboard ?? []

  const visibleRound = useMemo(() => {
    if (rounds.length === 0) return null
    return rounds.find(r => r.round === activeRound) || rounds[0]
  }, [rounds, activeRound])

  // ── Bet slip ───────────────────────────────────────────────────────────────

  // Combined odds with the same SGM haircuts the server applies:
  // 0.9 per extra same-game leg, tightened to 0.8 for extra legs on one player
  const slipOdds = useMemo(() => {
    const raw = slip.reduce((acc, l) => acc * l.odds, 1)
    const perGame = new Map<number, number>()
    const perPlayer = new Map<string, number>()
    for (const l of slip) {
      perGame.set(l.gameId, (perGame.get(l.gameId) || 0) + 1)
      if (l.playerId) perPlayer.set(l.playerId, (perPlayer.get(l.playerId) || 0) + 1)
    }
    let factor = 1
    for (const count of perGame.values()) if (count > 1) factor *= Math.pow(0.9, count - 1)
    for (const count of perPlayer.values()) if (count > 1) factor *= Math.pow(0.8 / 0.9, count - 1)
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
        label: `${teamName} to beat ${opponent}`,
        sublabel: `${game.homeTeam} v ${game.awayTeam} · R${game.round}`,
        odds,
        chipTeam: teamName,
        selection: teamName,
      },
      [`h2h:${game.gameId}:${game.homeTeam}`, `h2h:${game.gameId}:${game.awayTeam}`]
    )
  }

  const toggleRung = (game: GamePropsData, player: PropPlayer, rung: PropRung) => {
    // One rung per player per stat — picking 25+ replaces 20+ for the same player
    const replaceKeys = player.rungs
      .filter(r => r.stat === rung.stat)
      .map(r => `stat_plus:${game.gameId}:${player.playerId}:${r.stat}:${r.threshold}`)
    toggleLeg(
      {
        key: `stat_plus:${game.gameId}:${player.playerId}:${rung.stat}:${rung.threshold}`,
        gameId: game.gameId,
        market: 'stat_plus',
        label: `${player.playerName} ${rung.threshold}+ ${STAT_SHORT[rung.stat] || rung.stat}`,
        sublabel: `${game.homeTeam} v ${game.awayTeam}`,
        odds: rung.odds,
        chipTeam: player.team,
        playerId: player.playerId,
        stat: rung.stat,
        threshold: rung.threshold,
      },
      replaceKeys
    )
  }

  const placeBetMutation = useMutation({
    mutationFn: () => api.post('/multi/bets', {
      stake,
      compId: betContext === 'main' ? null : betContext,
      legs: slip.map(l => ({ gameId: l.gameId, market: l.market, selection: l.selection, playerId: l.playerId, stat: l.stat, threshold: l.threshold })),
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

  const activeBalance = activeComp ? activeComp.myBalance : balance
  const canPlace = slip.length > 0 && stake > 0 && stake <= activeBalance && !placeBetMutation.isPending

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark Nav */}
      <nav className="bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <FreakbetLogo size={36} />
              <span className="text-white font-black text-lg tracking-wide italic">FREAKBET</span>
              <span className="px-2 py-0.5 rounded-full bg-lime-400/15 text-lime-300 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
                <FreakCoin size={12} /> Freakazoids only
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Balance</p>
                <p className="text-sm font-black text-emerald-400">{money(balance)}</p>
              </div>
              <button
                onClick={() => { logout(); navigate('/welcome') }}
                className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* View tabs */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
            {(['markets', 'bets', 'comps', 'leaderboard'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${view === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab === 'markets' ? 'Markets' : tab === 'bets' ? 'My Bets' : tab === 'comps' ? `Comps${openComps.length > 0 ? ` (${openComps.length})` : ''}` : 'Leaderboard'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Freakazoids aren't money — they're better. Odds from Squiggle model probabilities.</p>
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
                                  {/* Stat tabs + search */}
                                  <div className="px-4 pt-3 pb-1 space-y-2">
                                    <div className="flex gap-1 overflow-x-auto">
                                      {STAT_TABS.map(tab => {
                                        const hasMarkets = gameProps.players.some(p => p.rungs.some(r => r.stat === tab.key))
                                        if (!hasMarkets) return null
                                        return (
                                          <button
                                            key={tab.key}
                                            onClick={() => setPropsTab(tab.key)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${propsTab === tab.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                          >
                                            {tab.label}
                                          </button>
                                        )
                                      })}
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="Search player…"
                                      value={propsSearch}
                                      onChange={e => setPropsSearch(e.target.value)}
                                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                                    />
                                  </div>
                                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                                    {gameProps.players
                                      .map(p => ({ player: p, rungs: p.rungs.filter(r => r.stat === propsTab) }))
                                      .filter(({ player, rungs }) => rungs.length > 0 && (!propsSearch || player.playerName.toLowerCase().includes(propsSearch.toLowerCase())))
                                      .sort((a, b) => (b.player.avgs[propsTab] || 0) - (a.player.avgs[propsTab] || 0))
                                      .map(({ player, rungs }) => {
                                        const inSlip = (k: string) => slip.some(l => l.key === k)
                                        return (
                                          <div key={player.playerId} className="px-4 py-2 flex items-center gap-2 bg-white">
                                            <TeamChip teamName={player.team} />
                                            <div className="w-32 min-w-0 flex-shrink-0">
                                              <p className="text-xs font-semibold text-slate-800 truncate">
                                                {player.playerName}
                                                {player.listedPosition && (
                                                  <span className="ml-1.5 px-1 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-black align-middle">
                                                    {POSITION_LABELS[player.listedPosition] || player.listedPosition}
                                                  </span>
                                                )}
                                              </p>
                                              <p className="text-[10px] text-slate-400">{(player.avgs[propsTab] || 0).toFixed(propsTab === 'goals' ? 2 : 1)} avg</p>
                                            </div>
                                            <div className="flex-1 flex items-center gap-1 flex-wrap justify-end">
                                              {rungs.map(rung => {
                                                const key = `stat_plus:${game.gameId}:${player.playerId}:${rung.stat}:${rung.threshold}`
                                                return (
                                                  <button
                                                    key={key}
                                                    onClick={() => toggleRung(gameProps, player, rung)}
                                                    className={`px-2 py-1 rounded-lg text-[11px] font-black transition-colors ${inSlip(key) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                  >
                                                    {rung.threshold}+ <span className="font-bold">{rung.odds.toFixed(2)}</span>
                                                  </button>
                                                )
                                              })}
                                            </div>
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

                {/* Wallet / comp context */}
                {openComps.length > 0 && (
                  <div className="px-4 py-2 bg-slate-800 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Bet with</span>
                    <select
                      value={betContext === 'main' ? 'main' : String(betContext)}
                      onChange={e => { clearMessages(); setBetContext(e.target.value === 'main' ? 'main' : Number(e.target.value)) }}
                      className="flex-1 rounded-lg bg-slate-700 text-white text-xs font-semibold px-2 py-1.5 focus:outline-none"
                    >
                      <option value="main">Main wallet ({money(balance)})</option>
                      {openComps.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({money(c.myBalance)})</option>
                      ))}
                    </select>
                  </div>
                )}

                {slip.length === 0 ? (
                  <div className="px-4 py-10 text-center text-slate-400 text-xs">
                    Tap odds to add legs.<br />Mix match results with player props.
                  </div>
                ) : (
                  <div>
                    {/* Legs grouped per game, Sportsbet style */}
                    {[...new Map(slip.map(l => [l.gameId, l.sublabel])).entries()].map(([gameId, sublabel]) => {
                      const gameLegs = slip.filter(l => l.gameId === gameId)
                      return (
                        <div key={gameId} className="border-b border-slate-100 last:border-0">
                          <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide truncate">{sublabel}</span>
                            {gameLegs.length > 1 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-black flex-shrink-0">SGM ×{gameLegs.length}</span>
                            )}
                          </div>
                          {gameLegs.map(leg => (
                            <div key={leg.key} className="px-4 py-2 flex items-center gap-2">
                              <TeamChip teamName={leg.chipTeam} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{leg.label}</p>
                                <p className="text-[10px] text-slate-400 truncate">{leg.market === 'h2h' ? 'Head to Head' : 'Player prop'}</p>
                              </div>
                              <span className="text-xs font-black text-slate-700">{leg.odds.toFixed(2)}</span>
                              <button onClick={() => { clearMessages(); setSlip(prev => prev.filter(l => l.key !== leg.key)) }} className="text-slate-300 hover:text-red-400 text-sm font-bold px-1">×</button>
                            </div>
                          ))}
                        </div>
                      )
                    })}
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
                    <span className="text-xs text-slate-500 font-semibold flex-shrink-0 flex items-center gap-0.5">Stake <FreakCoin size={12} /></span>
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
                  {stake > activeBalance && <p className="text-[11px] text-red-500 font-semibold">Stake exceeds your {activeComp ? 'comp' : ''} balance ({money(activeBalance)})</p>}
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
                {/* Live refresh bar */}
                {bets.some(b => b.status === 'pending') && (
                  <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-2">
                    <span className="text-xs text-slate-500 flex items-center gap-1.5">
                      {anyLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                      {anyLive ? 'Live tracking on' : 'Tap refresh to track your legs'}
                      {liveUpdatedAt > 0 && <span className="text-slate-400">· updated {new Date(liveUpdatedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>}
                    </span>
                    <button
                      onClick={() => refetchLive()}
                      disabled={liveFetching}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <svg className={`w-3.5 h-3.5 ${liveFetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      {liveFetching ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                )}
                {bets.map(bet => (
                  <div key={bet.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${statusChip(bet.status)}`}>{bet.status}</span>
                        <span className="text-xs font-bold text-slate-600">{bet.legs.length}-leg {bet.legs.length > 1 ? 'multi' : 'single'} @ {bet.totalOdds.toFixed(2)}</span>
                        {bet.compName && <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-black">{bet.compName}</span>}
                      </div>
                      <span className="text-[10px] text-slate-400">{new Date(bet.placedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {bet.legs.map(leg => {
                        const live = bet.status === 'pending' ? liveByLeg.get(leg.id) : null
                        return (
                          <div key={leg.id} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <TeamChip teamName={leg.market === 'h2h' ? leg.selection : leg.opponent} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{leg.selection}</p>
                                <p className="text-[10px] text-slate-400 truncate">{leg.market === 'h2h' ? `vs ${leg.opponent}` : leg.opponent} · R{leg.gameRound}</p>
                              </div>
                              <span className="text-xs font-bold text-slate-600">{leg.odds.toFixed(2)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${statusChip(leg.status)}`}>{leg.status}</span>
                            </div>
                            {/* Live progress (pending legs only) */}
                            {live && live.matchStatus !== 'SCHEDULED' && live.matchStatus !== 'UNCONFIRMED_TEAMS' && (
                              <div className="mt-1.5 pl-9">
                                {live.market === 'stat_plus' && live.target != null ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${live.hit ? 'bg-emerald-500' : 'bg-violet-500'}`}
                                        style={{ width: `${Math.min(100, ((live.current ?? 0) / live.target) * 100)}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] font-black tabular-nums ${live.hit ? 'text-emerald-600' : 'text-slate-600'}`}>
                                      {live.current ?? 0}/{live.target} {live.stat}
                                    </span>
                                    {live.hit
                                      ? <span className="text-emerald-500 text-xs font-black" title="Target reached">✓</span>
                                      : live.matchStatus === 'CONCLUDED'
                                        ? <span className="text-red-400 text-xs font-black" title="Missed">✕</span>
                                        : <span className="text-violet-400 text-[9px] font-bold">LIVE</span>}
                                  </div>
                                ) : live.market === 'h2h' ? (
                                  <div className="flex items-center gap-2 text-[10px] font-bold">
                                    <span className="tabular-nums text-slate-700">{live.current ?? 0} – {live.opponentScore ?? 0}</span>
                                    {live.leading === true && <span className="text-emerald-600">leading</span>}
                                    {live.leading === false && <span className="text-red-500">trailing</span>}
                                    {live.matchStatus === 'LIVE' && <span className="text-violet-400">LIVE</span>}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )
                      })}
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

        {/* ── COMPS ── */}
        {view === 'comps' && (
          <div className="max-w-3xl space-y-4">
            {compMsg && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs font-semibold text-violet-800 flex items-center justify-between">
                <span>{compMsg}</span>
                <button onClick={() => setCompMsg('')} className="text-violet-400 hover:text-violet-600 font-bold">×</button>
              </div>
            )}

            {/* Join + create */}
            <div className="flex gap-2 flex-wrap">
              <div className="flex gap-2 flex-1 min-w-[220px]">
                <input
                  type="text"
                  placeholder="Join code…"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  onClick={() => joinCompMutation.mutate()}
                  disabled={joinCode.length < 4 || joinCompMutation.isPending}
                  className={`px-4 py-2 rounded-xl text-sm font-bold ${joinCode.length >= 4 ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-300'}`}
                >
                  Join
                </button>
              </div>
              <button
                onClick={() => setShowCreateComp(v => !v)}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold"
              >
                {showCreateComp ? 'Close' : '+ Create Comp'}
              </button>
            </div>

            {/* Create form */}
            {showCreateComp && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <input
                  type="text" placeholder="Comp name (e.g. Thursday Night Footy)" value={compForm.name}
                  onChange={e => setCompForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={compForm.scopeType}
                    onChange={e => setCompForm(f => ({ ...f, scopeType: e.target.value as 'game' | 'round' }))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="game">Single game</option>
                    <option value="round">Whole round ({rounds[0]?.roundname || 'next round'})</option>
                  </select>
                  {compForm.scopeType === 'game' && (
                    <select
                      value={compForm.scopeGameId}
                      onChange={e => setCompForm(f => ({ ...f, scopeGameId: e.target.value }))}
                      className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                    >
                      <option value="">Pick the game…</option>
                      {rounds[0]?.games.filter(g => !g.locked).map(g => (
                        <option key={g.gameId} value={g.gameId}>{g.homeTeam} v {g.awayTeam}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Buy-in {FREAK_SYMBOL}
                    <input type="number" min="0" value={compForm.buyIn} onChange={e => setCompForm(f => ({ ...f, buyIn: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Budget {FREAK_SYMBOL}
                    <input type="number" min="1" value={compForm.startingBudget} onChange={e => setCompForm(f => ({ ...f, startingBudget: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Min bet {FREAK_SYMBOL}
                    <input type="number" min="0" placeholder="—" value={compForm.minBet} onChange={e => setCompForm(f => ({ ...f, minBet: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold" />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Max bet {FREAK_SYMBOL}
                    <input type="number" min="0" placeholder="—" value={compForm.maxBet} onChange={e => setCompForm(f => ({ ...f, maxBet: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold" />
                  </label>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <select
                    value={compForm.payoutRule}
                    onChange={e => setCompForm(f => ({ ...f, payoutRule: e.target.value }))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="winner_takes_all">Winner takes all</option>
                    <option value="podium">Podium 50/30/20</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={compForm.mustSpend} onChange={e => setCompForm(f => ({ ...f, mustSpend: e.target.checked }))} />
                    Must spend budget (unbet money is forfeited)
                  </label>
                </div>
                <button
                  onClick={() => createCompMutation.mutate()}
                  disabled={!compForm.name || (compForm.scopeType === 'game' && !compForm.scopeGameId) || createCompMutation.isPending}
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-300 text-white text-sm font-black"
                >
                  {createCompMutation.isPending ? 'Creating…' : 'Create Comp'}
                </button>
              </div>
            )}

            {/* My comps */}
            {comps.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 px-6 py-12 text-center text-slate-400 text-sm">
                No comps yet — create one for tonight's game and share the code.
              </div>
            ) : (
              comps.map(comp => (
                <div key={comp.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">
                        {comp.name}
                        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase align-middle ${comp.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{comp.status}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {comp.scopeType === 'game' ? 'Single game' : `Round ${comp.scopeRound}`} · {comp.memberCount} in · buy-in {money(comp.buyIn)} · budget {money(comp.startingBudget)}
                        {comp.minBet != null ? ` · min ${money(comp.minBet)}` : ''}{comp.maxBet != null ? ` · max ${money(comp.maxBet)}` : ''}
                        {comp.mustSpend ? ' · must spend' : ''} · {comp.payoutRule === 'podium' ? 'podium 50/30/20' : 'winner takes all'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[9px] text-slate-400 uppercase font-bold">{comp.status === 'open' ? 'Comp balance' : comp.myRank === 1 ? 'Winner!' : `Finished #${comp.myRank ?? '-'}`}</p>
                        <p className="text-sm font-black text-slate-900">{comp.status === 'open' ? money(comp.myBalance) : comp.myPayout != null && comp.myPayout > 0 ? `+${money(comp.myPayout)}` : money(comp.myBalance)}</p>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/join/${comp.joinCode}`); setCompMsg(`Invite link copied — send it to your mates. Code: ${comp.joinCode}`) }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-black tracking-widest text-slate-700"
                        title="Copy invite link"
                      >
                        {comp.joinCode}
                      </button>
                      <button
                        onClick={() => setExpandedCompId(expandedCompId === comp.id ? null : comp.id)}
                        className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                      >
                        {expandedCompId === comp.id ? '▲' : '▼'}
                      </button>
                    </div>
                  </div>
                  {expandedCompId === comp.id && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {compLeaderboard.map((row, idx) => {
                        const isMe = row.userId === user?.id
                        return (
                          <div key={row.userId} className={`px-4 py-2.5 flex items-center gap-2 ${isMe ? 'bg-violet-50/60' : ''}`}>
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black flex-shrink-0 ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'}`}>{row.finalRank ?? idx + 1}</span>
                            <span className={`flex-1 text-xs font-semibold truncate ${isMe ? 'text-violet-800' : 'text-slate-800'}`}>{row.displayName}{isMe ? ' (you)' : ''}</span>
                            <span className="text-[10px] text-slate-400">staked {money(row.totalStaked)}</span>
                            {row.payout != null && row.payout > 0 && <span className="text-[10px] font-black text-emerald-600">+{money(row.payout)} pool</span>}
                            <span className="text-xs font-black text-slate-900">{money(row.score)}</span>
                          </div>
                        )
                      })}
                      <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Pool: {money(comp.buyIn * comp.memberCount)} · paid to {comp.payoutRule === 'podium' ? 'top 3' : 'the winner'} when all games finish</span>
                        {comp.status === 'open' && (
                          <button
                            onClick={() => { setBetContext(comp.id); setView('markets') }}
                            className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black"
                          >
                            Bet in this comp →
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
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
