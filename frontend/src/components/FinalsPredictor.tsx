import { useState, useMemo } from 'react'
import { getTeamMeta, posBadgeClass, totalForMember } from '../utils/aflTeams'

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

export interface FinalsPredictorProps {
  consensusLadder: ConsensusEntry[]
  predictions: MemberPrediction[]
  currentUserId: number | null
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
}: FinalsPredictorProps) {
  const [finalsPicks, setFinalsPicks] = useState<Record<string, string>>({})
  const [rightPanel, setRightPanel] = useState<'ladder' | 'leaderboard'>('ladder')

  const top10 = consensusLadder.slice(0, 10).map(d => d.teamName)
  const restNames = consensusLadder.slice(10).map(d => d.teamName)

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

  const finalsState = useMemo(() => {
    // A pick only counts while it matches one of the current participants,
    // so changing an upstream result invalidates downstream picks.
    const pickOf = (matchId: string, a: string | null, b: string | null) => {
      const p = finalsPicks[matchId] || null
      return p && a && b && (p === a || p === b) ? p : null
    }

    // 2026 Wildcard Round: WC1 = 7v10, WC2 = 8v9 — winners take the last two spots
    const wc1w = pickOf('WC1', top10[6] || null, top10[9] || null)
    const wc1l = wc1w ? (wc1w === top10[6] ? top10[9] : top10[6]) : null
    const wc2w = pickOf('WC2', top10[7] || null, top10[8] || null)
    const wc2l = wc2w ? (wc2w === top10[7] ? top10[8] : top10[7]) : null

    // Higher-ranked wildcard winner is re-seeded 7th, the other 8th
    let seed7: string | null = null
    let seed8: string | null = null
    if (wc1w && wc2w) {
      if (top10.indexOf(wc1w) < top10.indexOf(wc2w)) { seed7 = wc1w; seed8 = wc2w }
      else { seed7 = wc2w; seed8 = wc1w }
    }

    // AFL final eight: QF1 = 1v4, QF2 = 2v3, EF1 = 5v8, EF2 = 6v7
    const qf1w = pickOf('QF1', top10[0] || null, top10[3] || null)
    const qf1l = qf1w ? (qf1w === top10[0] ? top10[3] : top10[0]) : null
    const qf2w = pickOf('QF2', top10[1] || null, top10[2] || null)
    const qf2l = qf2w ? (qf2w === top10[1] ? top10[2] : top10[1]) : null
    const ef1w = pickOf('EF1', top10[4] || null, seed8)
    const ef1l = ef1w ? (ef1w === top10[4] ? seed8 : top10[4]) : null
    const ef2w = pickOf('EF2', top10[5] || null, seed7)
    const ef2l = ef2w ? (ef2w === top10[5] ? seed7 : top10[5]) : null

    // SF1 = QF1 loser v EF1 winner, SF2 = QF2 loser v EF2 winner
    const sf1w = pickOf('SF1', qf1l, ef1w)
    const sf1l = sf1w ? (sf1w === qf1l ? ef1w : qf1l) : null
    const sf2w = pickOf('SF2', qf2l, ef2w)
    const sf2l = sf2w ? (sf2w === qf2l ? ef2w : qf2l) : null

    // PF1 = QF1 winner v SF2 winner, PF2 = QF2 winner v SF1 winner
    const pf1w = pickOf('PF1', qf1w, sf2w)
    const pf1l = pf1w ? (pf1w === qf1w ? sf2w : qf1w) : null
    const pf2w = pickOf('PF2', qf2w, sf1w)
    const pf2l = pf2w ? (pf2w === qf2w ? sf1w : qf2w) : null

    const gfw = pickOf('GF', pf1w, pf2w)
    const gfl = gfw ? (gfw === pf1w ? pf2w : pf1w) : null

    return { wc1w, wc1l, wc2w, wc2l, seed7, seed8, qf1w, qf1l, qf2w, qf2l, ef1w, ef1l, ef2w, ef2l, sf1w, sf1l, sf2w, sf2l, pf1w, pf1l, pf2w, pf2l, gfw, gfl }
  }, [finalsPicks, top10])

  // ── Final Standings ──────────────────────────────────────────────────────────

  const finalStandings = useMemo((): string[] | null => {
    const { gfw, gfl, pf1l, pf2l, sf1l, sf2l, ef1l, ef2l, wc1l, wc2l, seed7, seed8 } = finalsState
    if (!gfw || !gfl || !pf1l || !pf2l || !sf1l || !sf2l || !ef1l || !ef2l || !wc1l || !wc2l || !seed7 || !seed8) return null

    // Effective top 8 after wildcard re-seeding — used to order eliminated teams
    const effTop8 = [...top10.slice(0, 6), seed7, seed8]
    const prelimLosers = [pf1l, pf2l].sort((a, b) => effTop8.indexOf(a) - effTop8.indexOf(b))
    const semiLosers = [sf1l, sf2l].sort((a, b) => effTop8.indexOf(a) - effTop8.indexOf(b))
    const elimLosers = [ef1l, ef2l].sort((a, b) => effTop8.indexOf(a) - effTop8.indexOf(b))
    const wcLosers = [wc1l, wc2l].sort((a, b) => top10.indexOf(a) - top10.indexOf(b))

    return [gfw, gfl, prelimLosers[0], prelimLosers[1], semiLosers[0], semiLosers[1], elimLosers[0], elimLosers[1], wcLosers[0], wcLosers[1], ...restNames]
  }, [finalsState, top10, restNames])

  // ── Simulated Leaderboard ────────────────────────────────────────────────────

  const simLeaderboard = useMemo(() => {
    const ladder = finalStandings || [...top10, ...restNames]
    if (ladder.length === 0 || predictions.length === 0) return []
    return [...predictions]
      .map(mp => ({ ...mp, simScore: totalForMember(mp, ladder) }))
      .sort((a, b) => a.simScore - b.simScore)
  }, [finalStandings, top10, restNames, predictions])

  const { wc1w, wc1l, wc2w, wc2l, seed7, seed8, qf1w, qf1l, qf2w, qf2l, ef1w, ef1l, ef2w, ef2l, sf1w, sf1l, sf2w, sf2l, pf1w, pf1l, pf2w, pf2l, gfw, gfl } = finalsState
  const hasPicks = Object.keys(finalsPicks).length > 0

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:divide-x lg:divide-slate-100">

      {/* ── LEFT: Finals Bracket ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 p-4 lg:p-5">

        {/* Note + Clear */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-[11px] text-slate-400 italic">
            Seeds based on {modelCount != null ? `average of ${modelCount} Squiggle model projections` : 'Squiggle consensus'}
          </p>
          {hasPicks && (
            <button
              onClick={handleClear}
              className="text-[10px] text-slate-400 hover:text-red-500 font-medium transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="space-y-5">

          {/* Seedings */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Seedings (consensus)</p>
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
                teamA={top10[6] || null}
                teamB={top10[9] || null}
                picked={wc1w}
                onPick={handleFinalsPick}
                disabled={top10.length < 10}
              />
              <FinalsMatchCard
                matchId="WC2"
                label="WC2 — Seed 8 vs Seed 9"
                teamA={top10[7] || null}
                teamB={top10[8] || null}
                picked={wc2w}
                onPick={handleFinalsPick}
                disabled={top10.length < 9}
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
                teamA={top10[0] || null}
                teamB={top10[3] || null}
                picked={qf1w}
                onPick={handleFinalsPick}
                disabled={top10.length < 4}
              />
              <FinalsMatchCard
                matchId="QF2"
                label="QF2 — Seed 2 vs Seed 3"
                teamA={top10[1] || null}
                teamB={top10[2] || null}
                picked={qf2w}
                onPick={handleFinalsPick}
                disabled={top10.length < 4}
              />
              <FinalsMatchCard
                matchId="EF1"
                label="EF1 — Seed 5 vs WC winner (8th)"
                teamA={top10[4] || null}
                teamB={seed8}
                picked={ef1w}
                onPick={handleFinalsPick}
                disabled={!seed8}
              />
              <FinalsMatchCard
                matchId="EF2"
                label="EF2 — Seed 6 vs WC winner (7th)"
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
                label="SF1 — QF1 loser vs EF1 winner"
                teamA={qf1l}
                teamB={ef1w}
                picked={sf1w}
                onPick={handleFinalsPick}
                disabled={!qf1l || !ef1w}
              />
              <FinalsMatchCard
                matchId="SF2"
                label="SF2 — QF2 loser vs EF2 winner"
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
                label="PF1 — QF1 winner vs SF2 winner"
                teamA={qf1w}
                teamB={sf2w}
                picked={pf1w}
                onPick={handleFinalsPick}
                disabled={!qf1w || !sf2w}
              />
              <FinalsMatchCard
                matchId="PF2"
                label="PF2 — QF2 winner vs SF1 winner"
                teamA={qf2w}
                teamB={sf1w}
                picked={pf2w}
                onPick={handleFinalsPick}
                disabled={!qf2w || !sf1w}
              />
            </div>
          </div>

          {/* Week 5 */}
          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">Week 5 — Grand Final</p>
            <FinalsMatchCard
              matchId="GF"
              label="Grand Final"
              teamA={pf1w}
              teamB={pf2w}
              picked={gfw}
              onPick={handleFinalsPick}
              disabled={!pf1w || !pf2w}
            />
          </div>

          {/* Eliminated summary */}
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
            {consensusLadder.length === 0 ? (
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
              {finalStandings ? 'Simulated final positions' : 'Consensus seeding — pick finals to update'}
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
