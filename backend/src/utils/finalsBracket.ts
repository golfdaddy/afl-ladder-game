// Pure finals bracket computation — shared rules for the finals predictor and
// for deriving the post-finals ladder from real results. Kept free of I/O so it
// can be unit tested. Mirrors frontend/src/utils/finalsBracket.ts.
//
// Formats:
//   wildcard10 — top 10 qualify; 7v10 and 8v9 wildcard games decide the last two
//                spots, then the classic final eight (2026 onward).
//   top8       — classic final eight only (QF 1v4 / 2v3, EF 5v8 / 6v7).
//
// Post-finals ordering used by the game's scoring: premier 1st, runner-up 2nd,
// preliminary final losers 3/4, semi losers 5/6, elimination losers 7/8, wildcard
// losers 9/10 — tied pairs ordered by effective seed — then the rest of the
// home-and-away ladder unchanged.

export type FinalsFormat = 'wildcard10' | 'top8'

export interface FinalsGameResult {
  hteamName: string
  ateamName: string
  winnerName: string | null
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

const EMPTY: MatchState = { a: null, b: null, winner: null, loser: null, locked: false }

export function qualifierCount(format: FinalsFormat): number {
  return format === 'wildcard10' ? 10 : 8
}

export function isValidFinalsFormat(value: unknown): value is FinalsFormat {
  return value === 'wildcard10' || value === 'top8'
}

export function computeBracket(
  seeds: string[],
  picks: Record<string, string>,
  games: FinalsGameResult[],
  format: FinalsFormat = 'wildcard10'
): BracketState {
  const inGame = (g: FinalsGameResult, t: string | null) => t !== null && (g.hteamName === t || g.ateamName === t)

  const realResult = (a: string | null, b: string | null): string | null => {
    if (!a || !b) return null
    const g = games.find(g => g.winnerName && inGame(g, a) && inGame(g, b))
    return g?.winnerName || null
  }

  // A real result locks the match; otherwise a pick only counts while it matches
  // one of the current participants.
  const resolve = (matchId: string, a: string | null, b: string | null): MatchState => {
    const real = realResult(a, b)
    if (real) return { a, b, winner: real, loser: real === a ? b : a, locked: true }
    const p = picks[matchId] || null
    const winner = p && a && b && (p === a || p === b) ? p : null
    return { a, b, winner, loser: winner ? (winner === a ? b : a) : null, locked: false }
  }

  let WC1: MatchState = EMPTY
  let WC2: MatchState = EMPTY
  let seed7: string | null = null
  let seed8: string | null = null

  if (format === 'wildcard10') {
    // Prefer the real fixture pairings when available, in case the stored
    // ladder's 9/10 order differs from the home-and-away seeding.
    let wc1Pair: [string | null, string | null] = [seeds[6] || null, seeds[9] || null]
    let wc2Pair: [string | null, string | null] = [seeds[7] || null, seeds[8] || null]
    const wcGroup = new Set(seeds.slice(6, 10))
    const realWc = games.filter(g => wcGroup.has(g.hteamName) && wcGroup.has(g.ateamName))
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
    const realEf1 = games.find(g => inGame(g, seeds[4] || null) && (inGame(g, seed7) || inGame(g, seed8)))
    if (realEf1) {
      ef1Opp = inGame(realEf1, seed7) ? seed7 : seed8
      ef2Opp = ef1Opp === seed7 ? seed8 : seed7
    }
  }

  const QF1 = resolve('QF1', seeds[0] || null, seeds[3] || null)
  const QF2 = resolve('QF2', seeds[1] || null, seeds[2] || null)
  const EF1 = resolve('EF1', seeds[4] || null, ef1Opp)
  const EF2 = resolve('EF2', seeds[5] || null, ef2Opp)
  const SF1 = resolve('SF1', QF1.loser, EF1.winner)
  const SF2 = resolve('SF2', QF2.loser, EF2.winner)
  const PF1 = resolve('PF1', QF1.winner, SF2.winner)
  const PF2 = resolve('PF2', QF2.winner, SF1.winner)
  const GF = resolve('GF', PF1.winner, PF2.winner)

  return { WC1, WC2, seed7, seed8, QF1, QF2, EF1, EF2, SF1, SF2, PF1, PF2, GF }
}

function effectiveTop8(state: BracketState, seeds: string[]): string[] {
  return [...seeds.slice(0, 6), state.seed7 || '', state.seed8 || '']
}

/** Full post-finals ladder once every match is decided (picks or results), else null. */
export function computeFinalStandings(
  state: BracketState,
  seeds: string[],
  rest: string[],
  format: FinalsFormat = 'wildcard10'
): string[] | null {
  const { GF, PF1, PF2, SF1, SF2, EF1, EF2, WC1, WC2, seed7, seed8 } = state
  const wcDone = format !== 'wildcard10' || (WC1.loser && WC2.loser)
  if (!GF.winner || !GF.loser || !PF1.loser || !PF2.loser || !SF1.loser || !SF2.loser || !EF1.loser || !EF2.loser || !wcDone || !seed7 || !seed8) return null

  const eff = effectiveTop8(state, seeds)
  const bySeed = (pair: string[]) => [...pair].sort((a, b) => eff.indexOf(a) - eff.indexOf(b))
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

/**
 * Positions that real results have already settled, as team → position.
 * Only pairs that are fully decided are pinned (e.g. both preliminary finals
 * must be played before 3rd/4th can be ordered by seed). Everything else keeps
 * its home-and-away order until its round completes.
 */
export function deriveResultPins(
  seeds: string[],
  games: FinalsGameResult[],
  format: FinalsFormat = 'wildcard10'
): Record<string, number> {
  const state = computeBracket(seeds, {}, games, format)
  const pins: Record<string, number> = {}
  const eff = effectiveTop8(state, seeds)
  const bySeed = (pair: string[]) => [...pair].sort((a, b) => eff.indexOf(a) - eff.indexOf(b))
  const pinPair = (m1: MatchState, m2: MatchState, first: number, order: (p: string[]) => string[]) => {
    if (m1.locked && m2.locked && m1.loser && m2.loser) {
      const [x, y] = order([m1.loser, m2.loser])
      pins[x] = first
      pins[y] = first + 1
    }
  }

  if (state.GF.locked && state.GF.winner && state.GF.loser) {
    pins[state.GF.winner] = 1
    pins[state.GF.loser] = 2
  }
  pinPair(state.PF1, state.PF2, 3, bySeed)
  pinPair(state.SF1, state.SF2, 5, bySeed)
  pinPair(state.EF1, state.EF2, 7, bySeed)
  if (format === 'wildcard10') {
    pinPair(state.WC1, state.WC2, 9, pair => [...pair].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b)))
  }
  return pins
}
