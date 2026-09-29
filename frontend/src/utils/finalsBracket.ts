// Pure bracket computation for the AFL finals. Used by FinalsPredictor and
// FullSeasonSimulator — kept free of React so it can be tested directly.
// Mirrors backend/src/utils/finalsBracket.ts, which derives the real
// post-finals ladder with the same rules.
//
// Formats:
//   wildcard10 — top 10 qualify; 7v10 and 8v9 wildcard games decide the last two
//                spots, then the classic final eight (2026 onward).
//   top8       — classic final eight only (QF 1v4 / 2v3, EF 5v8 / 6v7).

export type FinalsFormat = 'wildcard10' | 'top8'

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

type GameResult = Pick<FinalsGame, 'hteamName' | 'ateamName' | 'winnerName'>

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

const EMPTY: MatchState = { a: null, b: null, winner: null, loser: null, locked: false }

/** How many teams qualify for finals under a format. */
export function qualifierCount(format: FinalsFormat): number {
  return format === 'wildcard10' ? 10 : 8
}

export function computeBracket(
  seeds: string[],
  finalsPicks: Record<string, string>,
  finalsGames: GameResult[],
  format: FinalsFormat = 'wildcard10'
): BracketState {
  const inGame = (g: GameResult, t: string | null) => t !== null && (g.hteamName === t || g.ateamName === t)

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

  let WC1: MatchState = EMPTY
  let WC2: MatchState = EMPTY
  let seed7: string | null = null
  let seed8: string | null = null

  if (format === 'wildcard10') {
    // Wildcard Round: WC1 = 7v10, WC2 = 8v9 — winners take the last two spots.
    // Prefer the real fixture pairings when available, in case the stored
    // ladder's 9/10 order differs from the home-and-away seeding.
    let wc1Pair: [string | null, string | null] = [seeds[6] || null, seeds[9] || null]
    let wc2Pair: [string | null, string | null] = [seeds[7] || null, seeds[8] || null]
    const wcGroup = new Set(seeds.slice(6, 10))
    const realWc = finalsGames.filter(g => wcGroup.has(g.hteamName) && wcGroup.has(g.ateamName))
    if (realWc.length === 2 && new Set(realWc.flatMap(g => [g.hteamName, g.ateamName])).size === 4) {
      const g1 = realWc.find(g => inGame(g, seeds[6] || null)) || realWc[0]
      const g2 = realWc.find(g => g !== g1)!
      wc1Pair = [g1.hteamName, g1.ateamName]
      wc2Pair = [g2.hteamName, g2.ateamName]
    }
    WC1 = resolve('WC1', wc1Pair[0], wc1Pair[1])
    WC2 = resolve('WC2', wc2Pair[0], wc2Pair[1])
    // Higher-ranked wildcard winner is re-seeded 7th, the other 8th
    if (WC1.winner && WC2.winner) {
      if (seeds.indexOf(WC1.winner) < seeds.indexOf(WC2.winner)) { seed7 = WC1.winner; seed8 = WC2.winner }
      else { seed7 = WC2.winner; seed8 = WC1.winner }
    }
  } else {
    seed7 = seeds[6] || null
    seed8 = seeds[7] || null
  }

  // Final eight: QF1 = 1v4, QF2 = 2v3, EF1 = 5v8, EF2 = 6v7 — prefer the real
  // elimination-final pairings if the fixture disagrees.
  let ef1Opp = seed8
  let ef2Opp = seed7
  if (seed7 && seed8) {
    const realEf1 = finalsGames.find(g => inGame(g, seeds[4] || null) && (inGame(g, seed7) || inGame(g, seed8)))
    if (realEf1) {
      ef1Opp = inGame(realEf1, seed7) ? seed7 : seed8
      ef2Opp = ef1Opp === seed7 ? seed8 : seed7
    }
  }

  const QF1 = resolve('QF1', seeds[0] || null, seeds[3] || null)
  const QF2 = resolve('QF2', seeds[1] || null, seeds[2] || null)
  const EF1 = resolve('EF1', seeds[4] || null, ef1Opp)
  const EF2 = resolve('EF2', seeds[5] || null, ef2Opp)

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
  seeds: string[],
  rest: string[],
  format: FinalsFormat = 'wildcard10'
): string[] | null {
  const { GF, PF1, PF2, SF1, SF2, EF1, EF2, WC1, WC2, seed7, seed8 } = state
  const wcDone = format !== 'wildcard10' || (WC1.loser && WC2.loser)
  if (!GF.winner || !GF.loser || !PF1.loser || !PF2.loser || !SF1.loser || !SF2.loser || !EF1.loser || !EF2.loser || !wcDone || !seed7 || !seed8) return null

  // Effective top 8 after wildcard re-seeding — used to order eliminated teams
  const effTop8 = [...seeds.slice(0, 6), seed7, seed8]
  const bySeed = (pair: string[]) => [...pair].sort((a, b) => effTop8.indexOf(a) - effTop8.indexOf(b))
  const ordered = [
    GF.winner, GF.loser,
    ...bySeed([PF1.loser, PF2.loser]),
    ...bySeed([SF1.loser, SF2.loser]),
    ...bySeed([EF1.loser, EF2.loser]),
  ]
  if (format === 'wildcard10') {
    ordered.push(...[WC1.loser!, WC2.loser!].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b)))
  }
  return [...ordered, ...rest]
}
