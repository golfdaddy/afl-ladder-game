import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { getTeamMeta, posBadgeClass, totalForMember } from '../utils/aflTeams'
import { computeBracket, computeFinalStandings, qualifierCount, FinalsFormat } from '../utils/finalsBracket'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SimTeam {
  teamName: string
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  ladderPoints: number
  percentage: number
}

interface MemberPrediction {
  userId: number
  displayName: string
  ladder: string[]
}

export interface FullSeasonSimulatorProps {
  seasonYear: number
  aflLadderData: {
    ladder: {
      teams: Array<{
        teamName: string
        wins: number
        losses: number
        draws: number
        pointsFor: number
        pointsAgainst: number
        position: number
      }>
    }
  } | null | undefined
  predictions: MemberPrediction[]
  currentUserId: number | null
  /** Finals format for the season (wildcard round + eight, or classic eight) */
  finalsFormat?: FinalsFormat
}

interface RoundData {
  round: number
  roundname: string
  games: Array<{
    id: number
    round: number
    roundname: string
    hteam: string
    ateam: string
    hteamName: string
    ateamName: string
    complete: number
    date: string | null
    venue: string | null
    hprob: number | null
    is_final: number | null
  }>
}

interface AllRoundsResponse {
  rounds: RoundData[]
  year: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function TeamBadge({ teamName, size = 'md' }: { teamName: string | null; size?: 'sm' | 'md' }) {
  const meta = teamName ? getTeamMeta(teamName) : { shortName: '?', primaryColor: '#94a3b8', secondaryColor: '#cbd5e1', textColor: '#ffffff', name: '' }
  const dim = size === 'sm' ? 'w-8 h-8 text-[8px]' : 'w-10 h-10 text-[9px]'
  return (
    <div
      className={`${dim} rounded-xl flex flex-col overflow-hidden shadow-sm flex-shrink-0`}
      style={{ border: `1.5px solid ${meta.secondaryColor}40` }}
    >
      <div
        className="flex-1 flex items-center justify-center font-black"
        style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}
      >
        {meta.shortName}
      </div>
      <div className="h-1.5" style={{ backgroundColor: meta.secondaryColor }} />
    </div>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function GamePickCard({
  game,
  picked,
  onPick,
}: {
  game: RoundData['games'][0]
  picked: string | undefined
  onPick: (teamName: string) => void
}) {
  const homeMeta = getTeamMeta(game.hteamName)
  const awayMeta = getTeamMeta(game.ateamName)
  const homeProb = game.hprob != null ? Math.round(game.hprob * 100) : null
  const awayProb = homeProb != null ? 100 - homeProb : null

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex">
        <button
          onClick={() => onPick(game.hteamName)}
          className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 transition-all ${picked === game.hteamName ? '' : 'hover:bg-slate-50'}`}
          style={picked === game.hteamName ? { backgroundColor: `${homeMeta.primaryColor}15` } : {}}
        >
          <div
            className="w-10 h-10 rounded-xl flex flex-col overflow-hidden shadow-sm"
            style={{ border: picked === game.hteamName ? `2px solid ${homeMeta.primaryColor}` : '1.5px solid #e2e8f0' }}
          >
            <div className="flex-1 flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: homeMeta.primaryColor, color: homeMeta.textColor }}>
              {homeMeta.shortName}
            </div>
            <div className="h-1.5" style={{ backgroundColor: homeMeta.secondaryColor }} />
          </div>
          <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{game.hteamName}</span>
          {homeProb != null && <span className="text-[10px] text-slate-400">{homeProb}%</span>}
          {picked === game.hteamName && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: homeMeta.primaryColor }}>
              ✓ Winner
            </span>
          )}
        </button>

        <div className="flex items-center px-3 text-xs font-bold text-slate-300 flex-shrink-0 border-x border-slate-100">vs</div>

        <button
          onClick={() => onPick(game.ateamName)}
          className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 transition-all ${picked === game.ateamName ? '' : 'hover:bg-slate-50'}`}
          style={picked === game.ateamName ? { backgroundColor: `${awayMeta.primaryColor}15` } : {}}
        >
          <div
            className="w-10 h-10 rounded-xl flex flex-col overflow-hidden shadow-sm"
            style={{ border: picked === game.ateamName ? `2px solid ${awayMeta.primaryColor}` : '1.5px solid #e2e8f0' }}
          >
            <div className="flex-1 flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: awayMeta.primaryColor, color: awayMeta.textColor }}>
              {awayMeta.shortName}
            </div>
            <div className="h-1.5" style={{ backgroundColor: awayMeta.secondaryColor }} />
          </div>
          <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{game.ateamName}</span>
          {awayProb != null && <span className="text-[10px] text-slate-400">{awayProb}%</span>}
          {picked === game.ateamName && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: awayMeta.primaryColor }}>
              ✓ Winner
            </span>
          )}
        </button>
      </div>
      {game.venue && (
        <div className="text-[10px] text-slate-400 text-center py-1 border-t border-slate-100 bg-slate-50">{game.venue}</div>
      )}
    </div>
  )
}

function FinalsMatchCard({
  matchId,
  label,
  teamA,
  teamB,
  picked,
  onPick,
  disabled,
}: {
  matchId: string
  label: string
  teamA: string | null
  teamB: string | null
  picked: string | null
  onPick: (matchId: string, team: string) => void
  disabled: boolean
}) {
  const metaA = teamA ? getTeamMeta(teamA) : null
  const metaB = teamB ? getTeamMeta(teamB) : null
  const isReady = !disabled && teamA && teamB

  return (
    <div className={`rounded-xl border overflow-hidden ${isReady ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
      <div className="bg-slate-50 px-3 py-1 border-b border-slate-100">
        <span className="text-[10px] font-black text-slate-500 tracking-wide">{label}</span>
      </div>
      <div className="flex">
        {/* Team A */}
        <button
          disabled={!isReady}
          onClick={() => teamA && onPick(matchId, teamA)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 transition-all ${!isReady ? 'cursor-not-allowed' : picked === teamA ? '' : 'hover:bg-slate-50'}`}
          style={picked === teamA && metaA ? { backgroundColor: `${metaA.primaryColor}15` } : {}}
        >
          {teamA ? (
            <>
              <TeamBadge teamName={teamA} size="sm" />
              <span className="text-[10px] font-semibold text-slate-700 text-center leading-tight">{teamA}</span>
              {picked === teamA && metaA && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-full text-white" style={{ backgroundColor: metaA.primaryColor }}>✓</span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-slate-300 py-2">TBD</span>
          )}
        </button>

        <div className="flex items-center px-2 text-[10px] font-bold text-slate-300 border-x border-slate-100">vs</div>

        {/* Team B */}
        <button
          disabled={!isReady}
          onClick={() => teamB && onPick(matchId, teamB)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 transition-all ${!isReady ? 'cursor-not-allowed' : picked === teamB ? '' : 'hover:bg-slate-50'}`}
          style={picked === teamB && metaB ? { backgroundColor: `${metaB.primaryColor}15` } : {}}
        >
          {teamB ? (
            <>
              <TeamBadge teamName={teamB} size="sm" />
              <span className="text-[10px] font-semibold text-slate-700 text-center leading-tight">{teamB}</span>
              {picked === teamB && metaB && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-full text-white" style={{ backgroundColor: metaB.primaryColor }}>✓</span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-slate-300 py-2">TBD</span>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FullSeasonSimulator({
  seasonYear,
  aflLadderData,
  predictions,
  currentUserId,
  finalsFormat = 'wildcard10',
}: FullSeasonSimulatorProps) {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0)
  const [gamePicks, setGamePicks] = useState<Record<string, string>>({})
  const [showFinals, setShowFinals] = useState(false)
  const [finalsPicks, setFinalsPicks] = useState<Record<string, string>>({})
  const [rightPanel, setRightPanel] = useState<'ladder' | 'leaderboard'>('ladder')

  // Fetch all upcoming rounds
  const { data: allRoundsResponse, isLoading: roundsLoading } = useQuery<AllRoundsResponse>({
    queryKey: ['afl-all-upcoming-rounds', seasonYear],
    queryFn: () => api.get(`/admin/afl-all-upcoming-rounds?year=${seasonYear}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const allRounds: RoundData[] = allRoundsResponse?.rounds || []

  // ── Simulated Regular Season Ladder ─────────────────────────────────────────

  const simRegularSeasonLadder = useMemo((): SimTeam[] => {
    const rawTeams = aflLadderData?.ladder?.teams
    if (!Array.isArray(rawTeams) || rawTeams.length === 0) return []

    const standings: SimTeam[] = rawTeams.map(t => ({
      teamName: t.teamName,
      wins: t.wins || 0,
      losses: t.losses || 0,
      draws: t.draws || 0,
      pointsFor: t.pointsFor || 0,
      pointsAgainst: t.pointsAgainst || 0,
      ladderPoints: (t.wins || 0) * 4 + (t.draws || 0) * 2,
      percentage: t.pointsAgainst > 0 ? (t.pointsFor / t.pointsAgainst) * 100 : 0,
    }))

    // Apply all game picks across all rounds
    for (const [gameId, winnerName] of Object.entries(gamePicks)) {
      // Find the game across all rounds
      let foundGame: RoundData['games'][0] | undefined
      for (const round of allRounds) {
        foundGame = round.games.find(g => String(g.id) === gameId)
        if (foundGame) break
      }
      if (!foundGame) continue

      const loserName: string = foundGame.hteamName === winnerName ? foundGame.ateamName : foundGame.hteamName
      const winner = standings.find(t => t.teamName === winnerName)
      const loser = standings.find(t => t.teamName === loserName)

      if (winner) {
        winner.wins++
        winner.pointsFor += 90
        winner.pointsAgainst += 70
        winner.ladderPoints += 4
        winner.percentage = winner.pointsAgainst > 0 ? (winner.pointsFor / winner.pointsAgainst) * 100 : 0
      }
      if (loser) {
        loser.losses++
        loser.pointsFor += 70
        loser.pointsAgainst += 90
        loser.ladderPoints += 0
        loser.percentage = loser.pointsAgainst > 0 ? (loser.pointsFor / loser.pointsAgainst) * 100 : 0
      }
    }

    return standings.sort((a, b) => {
      if (b.ladderPoints !== a.ladderPoints) return b.ladderPoints - a.ladderPoints
      return b.percentage - a.percentage
    })
  }, [allRounds, gamePicks, aflLadderData])

  // ── Finals Bracket Computation ───────────────────────────────────────────────

  const finalsState = useMemo(() => {
    const top10 = simRegularSeasonLadder.slice(0, qualifierCount(finalsFormat)).map(t => t.teamName)
    const s = computeBracket(top10, finalsPicks, [], finalsFormat)
    return {
      top10, state: s,
      wc1w: s.WC1.winner, wc1l: s.WC1.loser, wc2w: s.WC2.winner, wc2l: s.WC2.loser,
      seed7: s.seed7, seed8: s.seed8,
      qf1w: s.QF1.winner, qf1l: s.QF1.loser, qf2w: s.QF2.winner, qf2l: s.QF2.loser,
      ef1w: s.EF1.winner, ef1l: s.EF1.loser, ef2w: s.EF2.winner, ef2l: s.EF2.loser,
      sf1w: s.SF1.winner, sf1l: s.SF1.loser, sf2w: s.SF2.winner, sf2l: s.SF2.loser,
      pf1w: s.PF1.winner, pf1l: s.PF1.loser, pf2w: s.PF2.winner, pf2l: s.PF2.loser,
      gfw: s.GF.winner, gfl: s.GF.loser,
    }
  }, [finalsPicks, simRegularSeasonLadder, finalsFormat])

  // ── Final Standings ──────────────────────────────────────────────────────────

  const finalStandings = useMemo((): string[] | null => {
    const rest = simRegularSeasonLadder.slice(finalsState.top10.length).map(t => t.teamName)
    return computeFinalStandings(finalsState.state, finalsState.top10, rest, finalsFormat)
  }, [finalsState, simRegularSeasonLadder, finalsFormat])

  // ── Simulated Leaderboard ────────────────────────────────────────────────────

  const simLeaderboard = useMemo(() => {
    const ladder = finalStandings || simRegularSeasonLadder.map(t => t.teamName)
    if (ladder.length === 0 || predictions.length === 0) return []
    return [...predictions]
      .map(mp => ({ ...mp, simScore: totalForMember(mp, ladder) }))
      .sort((a, b) => a.simScore - b.simScore)
  }, [finalStandings, simRegularSeasonLadder, predictions])

  // ── Derived State ────────────────────────────────────────────────────────────

  const currentRound = allRounds[currentRoundIdx]

  const totalGamesAcrossAllRounds = allRounds.reduce((sum, r) => sum + r.games.length, 0)
  const totalPickedAcrossAllRounds = Object.keys(gamePicks).length

  // Count picks for current round
  const currentRoundPicked = currentRound
    ? currentRound.games.filter(g => gamePicks[String(g.id)]).length
    : 0

  const handleGamePick = (gameId: string, teamName: string) => {
    setGamePicks(prev => ({ ...prev, [gameId]: teamName }))
  }

  const handleFinalsPick = (matchId: string, team: string) => {
    setFinalsPicks(prev => ({ ...prev, [matchId]: team }))
  }

  const handleClearAll = () => {
    setGamePicks({})
    setFinalsPicks({})
    setShowFinals(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (roundsLoading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (allRounds.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        No upcoming games available — check back when the round is announced.
      </div>
    )
  }

  const { top10, wc1w, wc1l, wc2w, wc2l, seed7, seed8, qf1w, qf1l, qf2w, qf2l, ef1w, ef1l, ef2w, ef2l, sf1w, sf1l, sf2w, sf2l, pf1w, pf1l, pf2w, pf2l, gfw, gfl } = finalsState

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:divide-x lg:divide-slate-100">

      {/* ── LEFT: Round picker / Finals bracket ─────────────────────────────── */}
      <div className="flex-1 min-w-0 p-4 lg:p-5">

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
            <button
              onClick={() => setShowFinals(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!showFinals ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Regular Season
            </button>
            <button
              onClick={() => setShowFinals(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showFinals ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Finals
            </button>
          </div>
          <span className="text-[10px] text-slate-400">
            {totalPickedAcrossAllRounds}/{totalGamesAcrossAllRounds} games picked
          </span>
          {(Object.keys(gamePicks).length > 0 || Object.keys(finalsPicks).length > 0) && (
            <button
              onClick={handleClearAll}
              className="ml-auto text-[10px] text-slate-400 hover:text-red-500 font-medium transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* ── REGULAR SEASON ── */}
        {!showFinals && (
          <>
            {/* Round tabs (scrollable pill row) */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {allRounds.map((round, idx) => {
                const picked = round.games.filter(g => gamePicks[String(g.id)]).length
                const total = round.games.length
                const isComplete = picked === total
                return (
                  <button
                    key={round.round}
                    onClick={() => setCurrentRoundIdx(idx)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      currentRoundIdx === idx
                        ? 'bg-slate-900 text-white shadow-sm'
                        : isComplete
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>R{round.round}</span>
                    {picked > 0 && (
                      <span className={`text-[9px] font-black px-1 py-0.5 rounded-full ${
                        currentRoundIdx === idx ? 'bg-white/20 text-white' : isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-700'
                      }`}>
                        {picked}/{total}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Current round games */}
            {currentRound && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-slate-700">{currentRound.roundname} — pick the winner</p>
                  <span className="text-[10px] text-slate-400">{currentRoundPicked}/{currentRound.games.length} picked</span>
                </div>
                <div className="space-y-2">
                  {currentRound.games.map(game => (
                    <GamePickCard
                      key={game.id}
                      game={game}
                      picked={gamePicks[String(game.id)]}
                      onPick={(teamName) => handleGamePick(String(game.id), teamName)}
                    />
                  ))}
                </div>

                {/* Round navigation */}
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setCurrentRoundIdx(i => Math.max(0, i - 1))}
                    disabled={currentRoundIdx === 0}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Prev
                  </button>
                  {currentRoundIdx < allRounds.length - 1 ? (
                    <button
                      onClick={() => setCurrentRoundIdx(i => Math.min(allRounds.length - 1, i + 1))}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      Next
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowFinals(true)}
                      className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      Simulate Finals
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── FINALS BRACKET ── */}
        {showFinals && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">Top 10 Seeds</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {top10.map((team, i) => {
                  const meta = getTeamMeta(team)
                  return (
                    <div key={team} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200">
                      <span className={`text-[9px] font-black w-4 h-4 rounded flex items-center justify-center ${posBadgeClass(i)}`}>{i + 1}</span>
                      <div className="w-5 h-5 rounded flex flex-col overflow-hidden flex-shrink-0">
                        <div className="flex-1 flex items-center justify-center text-[7px] font-black" style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>{meta.shortName}</div>
                        <div className="h-0.5" style={{ backgroundColor: meta.secondaryColor }} />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-700">{team}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Week 1 — Wildcard Round (wildcard10 format only) */}
            {finalsFormat === 'wildcard10' && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 1 — Wildcard Round</p>
              <p className="text-[10px] text-slate-400 mb-2">7th–10th play off for the last two finals spots. The higher-ranked winner is re-seeded 7th, the other 8th. Top six rest this week.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FinalsMatchCard
                  matchId="WC1"
                  label={`WC1 — Seed 7 vs Seed 10`}
                  teamA={top10[6] || null}
                  teamB={top10[9] || null}
                  picked={wc1w}
                  onPick={handleFinalsPick}
                  disabled={top10.length < 10}
                />
                <FinalsMatchCard
                  matchId="WC2"
                  label={`WC2 — Seed 8 vs Seed 9`}
                  teamA={top10[7] || null}
                  teamB={top10[8] || null}
                  picked={wc2w}
                  onPick={handleFinalsPick}
                  disabled={top10.length < 9}
                />
              </div>
            </div>
            )}

            {/* Week 2 */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 2 — Qualifying & Elimination Finals</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FinalsMatchCard
                  matchId="QF1"
                  label={`QF1 — Seed 1 vs Seed 4`}
                  teamA={top10[0] || null}
                  teamB={top10[3] || null}
                  picked={qf1w}
                  onPick={handleFinalsPick}
                  disabled={top10.length < 4}
                />
                <FinalsMatchCard
                  matchId="QF2"
                  label={`QF2 — Seed 2 vs Seed 3`}
                  teamA={top10[1] || null}
                  teamB={top10[2] || null}
                  picked={qf2w}
                  onPick={handleFinalsPick}
                  disabled={top10.length < 4}
                />
                <FinalsMatchCard
                  matchId="EF1"
                  label={`EF1 — Seed 5 vs WC winner (8th)`}
                  teamA={top10[4] || null}
                  teamB={seed8}
                  picked={ef1w}
                  onPick={handleFinalsPick}
                  disabled={!seed8}
                />
                <FinalsMatchCard
                  matchId="EF2"
                  label={`EF2 — Seed 6 vs WC winner (7th)`}
                  teamA={top10[5] || null}
                  teamB={seed7}
                  picked={ef2w}
                  onPick={handleFinalsPick}
                  disabled={!seed7}
                />
              </div>
            </div>

            {/* Week 3 */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 3 — Semi Finals</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FinalsMatchCard
                  matchId="SF1"
                  label={`SF1 — QF1 loser vs EF1 winner`}
                  teamA={qf1l}
                  teamB={ef1w}
                  picked={sf1w}
                  onPick={handleFinalsPick}
                  disabled={!qf1l || !ef1w}
                />
                <FinalsMatchCard
                  matchId="SF2"
                  label={`SF2 — QF2 loser vs EF2 winner`}
                  teamA={qf2l}
                  teamB={ef2w}
                  picked={sf2w}
                  onPick={handleFinalsPick}
                  disabled={!qf2l || !ef2w}
                />
              </div>
            </div>

            {/* Week 4 */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 4 — Preliminary Finals</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FinalsMatchCard
                  matchId="PF1"
                  label={`PF1 — QF1 winner vs SF2 winner`}
                  teamA={qf1w}
                  teamB={sf2w}
                  picked={pf1w}
                  onPick={handleFinalsPick}
                  disabled={!qf1w || !sf2w}
                />
                <FinalsMatchCard
                  matchId="PF2"
                  label={`PF2 — QF2 winner vs SF1 winner`}
                  teamA={qf2w}
                  teamB={sf1w}
                  picked={pf2w}
                  onPick={handleFinalsPick}
                  disabled={!qf2w || !sf1w}
                />
              </div>
            </div>

            {/* Week 5 - Grand Final */}
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 5 — Grand Final</p>
              <FinalsMatchCard
                matchId="GF"
                label={`Grand Final`}
                teamA={pf1w}
                teamB={pf2w}
                picked={gfw}
                onPick={handleFinalsPick}
                disabled={!pf1w || !pf2w}
              />
            </div>

            {/* Finals elimination summary */}
            {(wc1l || wc2l || ef1l || ef2l || sf1l || sf2l || pf1l || pf2l || gfl) && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-2">Eliminated</p>
                <div className="space-y-1">
                  {gfw && gfl && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">2nd</span><TeamBadge teamName={gfl} size="sm" /><span>{gfl}</span><span className="text-slate-400">— GF runner-up</span></div>}
                  {pf1l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">3/4</span><TeamBadge teamName={pf1l} size="sm" /><span>{pf1l}</span><span className="text-slate-400">— Prelim loser</span></div>}
                  {pf2l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">3/4</span><TeamBadge teamName={pf2l} size="sm" /><span>{pf2l}</span><span className="text-slate-400">— Prelim loser</span></div>}
                  {sf1l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">5/6</span><TeamBadge teamName={sf1l} size="sm" /><span>{sf1l}</span><span className="text-slate-400">— Semi loser</span></div>}
                  {sf2l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">5/6</span><TeamBadge teamName={sf2l} size="sm" /><span>{sf2l}</span><span className="text-slate-400">— Semi loser</span></div>}
                  {ef1l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">7/8</span><TeamBadge teamName={ef1l} size="sm" /><span>{ef1l}</span><span className="text-slate-400">— Elim loser</span></div>}
                  {ef2l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">7/8</span><TeamBadge teamName={ef2l} size="sm" /><span>{ef2l}</span><span className="text-slate-400">— Elim loser</span></div>}
                  {wc1l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">9/10</span><TeamBadge teamName={wc1l} size="sm" /><span>{wc1l}</span><span className="text-slate-400">— Wildcard loser</span></div>}
                  {wc2l && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">9/10</span><TeamBadge teamName={wc2l} size="sm" /><span>{wc2l}</span><span className="text-slate-400">— Wildcard loser</span></div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT: Simulated Ladder / Leaderboard ───────────────────────────── */}
      <div className="lg:w-72 flex-shrink-0 p-4 lg:p-5">

        {/* Right panel toggle */}
        <div className="flex rounded-xl bg-slate-100 p-1 gap-1 mb-4">
          <button
            onClick={() => setRightPanel('ladder')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${rightPanel === 'ladder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {finalStandings ? 'Final Standings' : 'Sim. Ladder'}
          </button>
          <button
            onClick={() => setRightPanel('leaderboard')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${rightPanel === 'leaderboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Scores
          </button>
        </div>

        {/* ── SIMULATED LADDER ── */}
        {rightPanel === 'ladder' && (
          <>
            <p className="text-xs font-bold text-slate-700 mb-2">
              {finalStandings ? 'Final Standings' : 'Simulated Ladder'}
            </p>
            {simRegularSeasonLadder.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">Ladder data not available</div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {(finalStandings || simRegularSeasonLadder.map(t => t.teamName)).map((teamName, i) => {
                  const meta = getTeamMeta(teamName)
                  const isTop8 = i < 8
                  const isTop4 = i < 4
                  const isGfWinner = finalStandings && i === 0
                  return (
                    <div
                      key={teamName}
                      className={`flex items-center gap-2 px-3 py-2 ${isGfWinner ? 'bg-amber-50' : isTop4 ? 'bg-emerald-50/40' : isTop8 ? 'bg-blue-50/30' : 'bg-white'}`}
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black flex-shrink-0 ${posBadgeClass(i)}`}>
                        {i + 1}
                      </span>
                      <div
                        className="w-8 h-8 rounded-lg flex flex-col overflow-hidden shadow-sm flex-shrink-0"
                        style={{ border: `1.5px solid ${meta.secondaryColor}40` }}
                      >
                        <div className="flex-1 flex items-center justify-center text-[8px] font-black"
                          style={{ backgroundColor: meta.primaryColor, color: meta.textColor }}>
                          {meta.shortName}
                        </div>
                        <div className="h-1" style={{ backgroundColor: meta.secondaryColor }} />
                      </div>
                      <span className="flex-1 text-xs font-semibold text-slate-900 leading-tight truncate">{teamName}</span>
                      {isGfWinner && (
                        <span className="text-[9px] font-black text-amber-500 flex-shrink-0">Premiers!</span>
                      )}
                      {!finalStandings && i < simRegularSeasonLadder.length && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {simRegularSeasonLadder[i]?.ladderPoints}pts
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              {finalStandings ? 'Simulated final positions' : 'Sorted by ladder pts then percentage'}
            </p>
          </>
        )}

        {/* ── LEADERBOARD ── */}
        {rightPanel === 'leaderboard' && (
          <>
            <p className="text-xs font-bold text-slate-700 mb-2">
              {finalStandings ? 'Final Scores' : 'Predicted Scores'}
            </p>
            {simLeaderboard.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No predictions to score</div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {simLeaderboard.map((entry, idx) => {
                  const isMe = entry.userId === currentUserId
                  const bestScore = simLeaderboard[0]?.simScore
                  return (
                    <div key={entry.userId} className={`flex items-center gap-2 px-3 py-2.5 ${isMe ? 'bg-emerald-50/60' : 'bg-white'}`}>
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black flex-shrink-0 ${posBadgeClass(idx)}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-semibold truncate block ${isMe ? 'text-emerald-800' : 'text-slate-900'}`}>
                          {entry.displayName}
                        </span>
                        {isMe && (
                          <span className="text-[9px] text-emerald-600 font-semibold">You</span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-black ${entry.simScore === bestScore ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {entry.simScore}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              {finalStandings ? 'Based on final standings' : 'Based on simulated regular season ladder'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
