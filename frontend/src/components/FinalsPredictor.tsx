import { useState, useMemo } from 'react'
import { getTeamMeta, posBadgeClass, totalForMember } from '../utils/aflTeams'
import { computeBracket, computeFinalStandings, FinalsGame } from '../utils/finalsBracket'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ConsensusEntry {
  teamName: string
  avgRank: number
  ranksByModel?: Record<string, number>
}

interface MemberPrediction {
  userId: number
  displayName: string
  ladder: string[]
}

export type { FinalsGame }

export interface FinalsPredictorProps {
  consensusLadder: ConsensusEntry[]
  predictions: MemberPrediction[]
  currentUserId: number | null
  /** Actual AFL ladder in position order — used for seeding once finals begin */
  actualLadder?: string[]
  /** Real finals fixtures/results — completed games are locked into the bracket */
  finalsGames?: FinalsGame[]
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function TeamBadge({ teamName, size = 'md' }: { teamName: string | null; size?: 'sm' | 'md' }) {
  const meta = teamName
    ? getTeamMeta(teamName)
    : { shortName: '?', primaryColor: '#94a3b8', secondaryColor: '#cbd5e1', textColor: '#ffffff', name: '' }
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

function FinalsMatchCard({
  matchId,
  label,
  teamA,
  teamB,
  picked,
  onPick,
  disabled,
  locked = false,
}: {
  matchId: string
  label: string
  teamA: string | null
  teamB: string | null
  picked: string | null
  onPick: (matchId: string, team: string) => void
  disabled: boolean
  locked?: boolean
}) {
  const metaA = teamA ? getTeamMeta(teamA) : null
  const metaB = teamB ? getTeamMeta(teamB) : null
  const isReady = !disabled && !locked && teamA && teamB

  return (
    <div className={`rounded-xl border overflow-hidden ${locked ? 'border-emerald-200' : isReady ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
      <div className={`px-3 py-1 border-b flex items-center justify-between ${locked ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
        <span className="text-[10px] font-black text-slate-500 tracking-wide">{label}</span>
        {locked && (
          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wide">&#10003; Result</span>
        )}
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
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-full text-white" style={{ backgroundColor: metaA.primaryColor }}>&#10003;</span>
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
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-full text-white" style={{ backgroundColor: metaB.primaryColor }}>&#10003;</span>
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

export default function FinalsPredictor({
  consensusLadder,
  predictions,
  currentUserId,
  actualLadder = [],
  finalsGames = [],
}: FinalsPredictorProps) {
  const [finalsPicks, setFinalsPicks] = useState<Record<string, string>>({})
  const [rightPanel, setRightPanel] = useState<'ladder' | 'leaderboard'>('ladder')

  // Once finals have started (any real finals fixture exists) the home-and-away
  // ladder is final, so seed the bracket from the actual ladder instead of model
  // projections — which Squiggle stops publishing after the regular season.
  const finalsStarted = finalsGames.length > 0
  const useActualSeeds = actualLadder.length >= 10 && (finalsStarted || consensusLadder.length === 0)
  const seedSource = useActualSeeds ? actualLadder : consensusLadder.map(d => d.teamName)
  const top10 = seedSource.slice(0, 10)
  const restNames = seedSource.slice(10)

  // Derive number of models for the note
  const modelCount = useMemo(() => {
    const entry = consensusLadder.find(d => d.ranksByModel && Object.keys(d.ranksByModel).length > 0)
    if (!entry?.ranksByModel) return null
    return Object.keys(entry.ranksByModel).length
  }, [consensusLadder])

  const handleFinalsPick = (matchId: string, team: string) => {
    setFinalsPicks(prev => ({ ...prev, [matchId]: team }))
  }

  const handleClear = () => setFinalsPicks({})

  // ── Finals Bracket Computation ───────────────────────────────────────────────

  const finalsState = useMemo(
    () => computeBracket(top10, finalsPicks, finalsGames),
    [finalsPicks, top10, finalsGames]
  )

  // ── Final Standings ──────────────────────────────────────────────────────────

  const finalStandings = useMemo(
    (): string[] | null => computeFinalStandings(finalsState, top10, restNames),
    [finalsState, top10, restNames]
  )

  // ── Simulated Leaderboard ────────────────────────────────────────────────────

  const simLeaderboard = useMemo(() => {
    const ladder = finalStandings || [...top10, ...restNames]
    if (ladder.length === 0 || predictions.length === 0) return []
    return [...predictions]
      .map(mp => ({ ...mp, simScore: totalForMember(mp, ladder) }))
      .sort((a, b) => a.simScore - b.simScore)
  }, [finalStandings, top10, restNames, predictions])

  const { WC1, WC2, QF1, QF2, EF1, EF2, SF1, SF2, PF1, PF2, GF } = finalsState
  const hasPicks = Object.keys(finalsPicks).length > 0

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:divide-x lg:divide-slate-100">

      {/* ── LEFT: Finals Bracket ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 p-4 lg:p-5">

        {/* Note + Clear */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-[11px] text-slate-400 italic">
            {useActualSeeds
              ? `Seeds from the actual AFL ladder${finalsStarted ? ' — played finals are locked in' : ''}`
              : `Seeds based on ${modelCount != null ? `average of ${modelCount} Squiggle model projections` : 'Squiggle consensus'}`}
          </p>
          {hasPicks && (
            <button
              onClick={handleClear}
              className="text-[10px] text-slate-400 hover:text-red-500 font-medium transition-colors"
            >
              Clear picks
            </button>
          )}
        </div>

        <div className="space-y-5">

          {/* Seedings */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Seedings ({useActualSeeds ? 'actual ladder' : 'consensus'})</p>
            <div className="flex flex-wrap gap-1.5">
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

          {/* Week 1 — Wildcard Round (new in 2026) */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 1 — Wildcard Round</p>
            <p className="text-[10px] text-slate-400 mb-2">7th–10th play off for the last two finals spots. The higher-ranked winner is re-seeded 7th, the other 8th. Top six rest this week.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FinalsMatchCard
                matchId="WC1"
                label="WC1 — Seed 7 vs Seed 10"
                teamA={WC1.a}
                teamB={WC1.b}
                picked={WC1.winner}
                onPick={handleFinalsPick}
                disabled={top10.length < 10}
                locked={WC1.locked}
              />
              <FinalsMatchCard
                matchId="WC2"
                label="WC2 — Seed 8 vs Seed 9"
                teamA={WC2.a}
                teamB={WC2.b}
                picked={WC2.winner}
                onPick={handleFinalsPick}
                disabled={top10.length < 9}
                locked={WC2.locked}
              />
            </div>
          </div>

          {/* Week 2 */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 2 — Qualifying &amp; Elimination Finals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FinalsMatchCard
                matchId="QF1"
                label="QF1 — Seed 1 vs Seed 4"
                teamA={QF1.a}
                teamB={QF1.b}
                picked={QF1.winner}
                onPick={handleFinalsPick}
                disabled={top10.length < 4}
                locked={QF1.locked}
              />
              <FinalsMatchCard
                matchId="QF2"
                label="QF2 — Seed 2 vs Seed 3"
                teamA={QF2.a}
                teamB={QF2.b}
                picked={QF2.winner}
                onPick={handleFinalsPick}
                disabled={top10.length < 4}
                locked={QF2.locked}
              />
              <FinalsMatchCard
                matchId="EF1"
                label="EF1 — Seed 5 vs WC winner"
                teamA={EF1.a}
                teamB={EF1.b}
                picked={EF1.winner}
                onPick={handleFinalsPick}
                disabled={!EF1.b}
                locked={EF1.locked}
              />
              <FinalsMatchCard
                matchId="EF2"
                label="EF2 — Seed 6 vs WC winner"
                teamA={EF2.a}
                teamB={EF2.b}
                picked={EF2.winner}
                onPick={handleFinalsPick}
                disabled={!EF2.b}
                locked={EF2.locked}
              />
            </div>
          </div>

          {/* Week 3 */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 3 — Semi Finals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FinalsMatchCard
                matchId="SF1"
                label="SF1 — QF1 loser vs EF1 winner"
                teamA={SF1.a}
                teamB={SF1.b}
                picked={SF1.winner}
                onPick={handleFinalsPick}
                disabled={!SF1.a || !SF1.b}
                locked={SF1.locked}
              />
              <FinalsMatchCard
                matchId="SF2"
                label="SF2 — QF2 loser vs EF2 winner"
                teamA={SF2.a}
                teamB={SF2.b}
                picked={SF2.winner}
                onPick={handleFinalsPick}
                disabled={!SF2.a || !SF2.b}
                locked={SF2.locked}
              />
            </div>
          </div>

          {/* Week 4 */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 4 — Preliminary Finals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FinalsMatchCard
                matchId="PF1"
                label="PF1 — QF1 winner vs SF2 winner"
                teamA={PF1.a}
                teamB={PF1.b}
                picked={PF1.winner}
                onPick={handleFinalsPick}
                disabled={!PF1.a || !PF1.b}
                locked={PF1.locked}
              />
              <FinalsMatchCard
                matchId="PF2"
                label="PF2 — QF2 winner vs SF1 winner"
                teamA={PF2.a}
                teamB={PF2.b}
                picked={PF2.winner}
                onPick={handleFinalsPick}
                disabled={!PF2.a || !PF2.b}
                locked={PF2.locked}
              />
            </div>
          </div>

          {/* Week 5 */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 5 — Grand Final</p>
            <FinalsMatchCard
              matchId="GF"
              label="Grand Final"
              teamA={GF.a}
              teamB={GF.b}
              picked={GF.winner}
              onPick={handleFinalsPick}
              disabled={!GF.a || !GF.b}
              locked={GF.locked}
            />
          </div>

          {/* Eliminated summary */}
          {(WC1.loser || WC2.loser || EF1.loser || EF2.loser || SF1.loser || SF2.loser || PF1.loser || PF2.loser || GF.loser) && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-2">Eliminated</p>
              <div className="space-y-1">
                {GF.winner && GF.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">2nd</span><TeamBadge teamName={GF.loser} size="sm" /><span>{GF.loser}</span><span className="text-slate-400">— GF runner-up</span></div>}
                {PF1.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">3/4</span><TeamBadge teamName={PF1.loser} size="sm" /><span>{PF1.loser}</span><span className="text-slate-400">— Prelim loser</span></div>}
                {PF2.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">3/4</span><TeamBadge teamName={PF2.loser} size="sm" /><span>{PF2.loser}</span><span className="text-slate-400">— Prelim loser</span></div>}
                {SF1.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">5/6</span><TeamBadge teamName={SF1.loser} size="sm" /><span>{SF1.loser}</span><span className="text-slate-400">— Semi loser</span></div>}
                {SF2.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">5/6</span><TeamBadge teamName={SF2.loser} size="sm" /><span>{SF2.loser}</span><span className="text-slate-400">— Semi loser</span></div>}
                {EF1.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">7/8</span><TeamBadge teamName={EF1.loser} size="sm" /><span>{EF1.loser}</span><span className="text-slate-400">— Elim loser</span></div>}
                {EF2.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">7/8</span><TeamBadge teamName={EF2.loser} size="sm" /><span>{EF2.loser}</span><span className="text-slate-400">— Elim loser</span></div>}
                {WC1.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">9/10</span><TeamBadge teamName={WC1.loser} size="sm" /><span>{WC1.loser}</span><span className="text-slate-400">— Wildcard loser</span></div>}
                {WC2.loser && <div className="flex items-center gap-2 text-[10px] text-slate-600"><span className="font-bold text-slate-400 w-4">9/10</span><TeamBadge teamName={WC2.loser} size="sm" /><span>{WC2.loser}</span><span className="text-slate-400">— Wildcard loser</span></div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Ladder / Scores ───────────────────────────────────────────── */}
      <div className="lg:w-72 flex-shrink-0 p-4 lg:p-5">

        {/* Tab toggle */}
        <div className="flex rounded-xl bg-slate-100 p-1 gap-1 mb-4">
          <button
            onClick={() => setRightPanel('ladder')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${rightPanel === 'ladder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {finalStandings ? 'Final Standings' : 'Ladder'}
          </button>
          <button
            onClick={() => setRightPanel('leaderboard')}
            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${rightPanel === 'leaderboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Scores
          </button>
        </div>

        {/* ── LADDER ── */}
        {rightPanel === 'ladder' && (
          <>
            <p className="text-xs font-bold text-slate-700 mb-2">
              {finalStandings ? 'Final Standings' : 'Projected Ladder'}
            </p>
            {seedSource.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">Ladder data not available</div>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {(finalStandings || [...top10, ...restNames]).map((teamName, i) => {
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
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              {finalStandings ? 'Simulated final positions' : `${useActualSeeds ? 'Actual ladder' : 'Consensus seeding'} — pick finals to update`}
            </p>
          </>
        )}

        {/* ── SCORES ── */}
        {rightPanel === 'leaderboard' && (
          <>
            <p className="text-xs font-bold text-slate-700 mb-2">
              {finalStandings ? 'Final Scores' : 'Projected Scores'}
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
              {finalStandings ? 'Based on final standings' : 'Based on consensus seeding'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
