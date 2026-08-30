// Pure bracket computation for the 2026 AFL finals format (wildcard round + final eight).
// Used by FinalsPredictor — kept free of React so it can be tested directly.

export interface FinalsGame {
  id: number
  round: number
  roundname: string
  hteamName: string
  ateamName: string
  complete: number
  winnerName: string | null
  date: string | null
  venue: string | null
}

export interface MatchState {
  a: string | null
  b: string | null
  winner: string | null
  loser: string | null
  locked: boolean
}

export interface BracketState {
  WC1: MatchState
  WC2: MatchState
  seed7: string | null
  seed8: string | null
  QF1: MatchState
  QF2: MatchState
  EF1: MatchState
  EF2: MatchState
  SF1: MatchState
  SF2: MatchState
  PF1: MatchState
  PF2: MatchState
  GF: MatchState
}

export function computeBracket(
  top10: string[],
  finalsPicks: Record<string, string>,
  finalsGames: FinalsGame[]
): BracketState {
  const inGame = (g: FinalsGame, t: string | null) => t !== null && (g.hteamName === t || g.ateamName === t)

  // Real completed result between these two teams, if one has been played
  const realResult = (a: string | null, b: string | null): string | null => {
    if (!a || !b) return null
    const g = finalsGames.find(g => g.winnerName && inGame(g, a) && inGame(g, b))
    return g?.winnerName || null
  }

  // A real result locks the match; otherwise a pick only counts while it matches
  // one of the current participants, so changing an upstream result invalidates
  // downstream picks.
  const resolve = (matchId: string, a: string | null, b: string | null): MatchState => {
    const real = realResult(a, b)
    if (real) return { a, b, winner: real, loser: real === a ? b : a, locked: true }
    const p = finalsPicks[matchId] || null
    const winner = p && a && b && (p === a || p === b) ? p : null
    return { a, b, winner, loser: winner ? (winner === a ? b : a) : null, locked: false }
  }

  // 2026 Wildcard Round: WC1 = 7v10, WC2 = 8v9 — winners take the last two spots.
  // Prefer the real fixture pairings when Squiggle has them, in case the stored
  // ladder's 9/10 order differs from the home-and-away seeding.
  let wc1Pair: [string | null, string | null] = [top10[6] || null, top10[9] || null]
  let wc2Pair: [string | null, string | null] = [top10[7] || null, top10[8] || null]
  const wcGroup = new Set(top10.slice(6, 10))
  const realWcGames = finalsGames.filter(g => wcGroup.has(g.hteamName) && wcGroup.has(g.ateamName))
  if (realWcGames.length === 2 && new Set(realWcGames.flatMap(g => [g.hteamName, g.ateamName])).size === 4) {
    const g1 = realWcGames.find(g => inGame(g, top10[6] || null)) || realWcGames[0]
    const g2 = realWcGames.find(g => g !== g1)!
    wc1Pair = [g1.hteamName, g1.ateamName]
    wc2Pair = [g2.hteamName, g2.ateamName]
  }

  const WC1 = resolve('WC1', wc1Pair[0], wc1Pair[1])
  const WC2 = resolve('WC2', wc2Pair[0], wc2Pair[1])

  // Higher-ranked wildcard winner is re-seeded 7th, the other 8th
  let seed7: string | null = null
  let seed8: string | null = null
  if (WC1.winner && WC2.winner) {
    if (top10.indexOf(WC1.winner) < top10.indexOf(WC2.winner)) { seed7 = WC1.winner; seed8 = WC2.winner }
    else { seed7 = WC2.winner; seed8 = WC1.winner }
  }

  // AFL final eight: QF1 = 1v4, QF2 = 2v3, EF1 = 5v8, EF2 = 6v7.
  // Prefer the real elimination-final pairings if the fixture disagrees.
  let ef1Opp = seed8
  let ef2Opp = seed7
  if (seed7 && seed8) {
    const realEf1 = finalsGames.find(g => inGame(g, top10[4] || null) && (inGame(g, seed7) || inGame(g, seed8)))
    if (realEf1) {
      ef1Opp = inGame(realEf1, seed7) ? seed7 : seed8
      ef2Opp = ef1Opp === seed7 ? seed8 : seed7
    }
  }

  const QF1 = resolve('QF1', top10[0] || null, top10[3] || null)
  const QF2 = resolve('QF2', top10[1] || null, top10[2] || null)
  const EF1 = resolve('EF1', top10[4] || null, ef1Opp)
  const EF2 = resolve('EF2', top10[5] || null, ef2Opp)

  // SF1 = QF1 loser v EF1 winner, SF2 = QF2 loser v EF2 winner
  const SF1 = resolve('SF1', QF1.loser, EF1.winner)
  const SF2 = resolve('SF2', QF2.loser, EF2.winner)

  // PF1 = QF1 winner v SF2 winner, PF2 = QF2 winner v SF1 winner
  const PF1 = resolve('PF1', QF1.winner, SF2.winner)
  const PF2 = resolve('PF2', QF2.winner, SF1.winner)

  const GF = resolve('GF', PF1.winner, PF2.winner)

  return { WC1, WC2, seed7, seed8, QF1, QF2, EF1, EF2, SF1, SF2, PF1, PF2, GF }
}

// Post-finals ladder per the game's scoring: GF winner 1st, runner-up 2nd,
// prelim losers 3/4, semi losers 5/6, elim losers 7/8, wildcard losers 9/10 —
// tied pairs ordered by effective seed — then the rest of the ladder unchanged.
export function computeFinalStandings(
  state: BracketState,
  top10: string[],
  restNames: string[]
): string[] | null {
  const { GF, PF1, PF2, SF1, SF2, EF1, EF2, WC1, WC2, seed7, seed8 } = state
  if (!GF.winner || !GF.loser || !PF1.loser || !PF2.loser || !SF1.loser || !SF2.loser || !EF1.loser || !EF2.loser || !WC1.loser || !WC2.loser || !seed7 || !seed8) return null

  // Effective top 8 after wildcard re-seeding — used to order eliminated teams
  const effTop8 = [...top10.slice(0, 6), seed7, seed8]
  const bySeed = (pair: string[]) => [...pair].sort((a, b) => effTop8.indexOf(a) - effTop8.indexOf(b))
  const prelimLosers = bySeed([PF1.loser, PF2.loser])
  const semiLosers = bySeed([SF1.loser, SF2.loser])
  const elimLosers = bySeed([EF1.loser, EF2.loser])
  const wcLosers = [WC1.loser, WC2.loser].sort((a, b) => top10.indexOf(a) - top10.indexOf(b))

  return [GF.winner, GF.loser, prelimLosers[0], prelimLosers[1], semiLosers[0], semiLosers[1], elimLosers[0], elimLosers[1], wcLosers[0], wcLosers[1], ...restNames]
}
