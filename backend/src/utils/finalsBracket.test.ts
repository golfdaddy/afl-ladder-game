import { computeBracket, computeFinalStandings, deriveResultPins, FinalsGameResult } from './finalsBracket'

// 2026 home-and-away order (what Squiggle standings return)
const seeds = [
  'Fremantle', 'Sydney Swans', 'Brisbane Lions', 'Hawthorn', 'Geelong', 'Adelaide Crows',
  'Melbourne', 'Western Bulldogs', 'Collingwood', 'Carlton',
]
const rest = ['St Kilda', 'GWS Giants', 'Gold Coast Suns', 'North Melbourne', 'Port Adelaide', 'West Coast Eagles', 'Richmond', 'Essendon']

const game = (h: string, a: string, w: string | null): FinalsGameResult => ({ hteamName: h, ateamName: a, winnerName: w })

// The real 2026 finals as they were played
const wildcards = [game('Melbourne', 'Carlton', 'Carlton'), game('Western Bulldogs', 'Collingwood', 'Western Bulldogs')]
const week2 = [
  game('Fremantle', 'Hawthorn', 'Fremantle'),                   // QF1: 1 v 4
  game('Sydney Swans', 'Brisbane Lions', 'Brisbane Lions'),     // QF2: 2 v 3
  game('Geelong', 'Carlton', 'Geelong'),                        // EF1: 5 v re-seeded 8
  game('Adelaide Crows', 'Western Bulldogs', 'Adelaide Crows'), // EF2: 6 v re-seeded 7
]
const semis = [
  game('Hawthorn', 'Geelong', 'Hawthorn'),            // SF1: QF1 loser v EF1 winner
  game('Sydney Swans', 'Adelaide Crows', 'Sydney Swans'), // SF2: QF2 loser v EF2 winner
]
const prelims = [
  game('Fremantle', 'Sydney Swans', 'Fremantle'),     // PF1: QF1 winner v SF2 winner
  game('Brisbane Lions', 'Hawthorn', 'Brisbane Lions'), // PF2: QF2 winner v SF1 winner
]
const grandFinal = [game('Fremantle', 'Brisbane Lions', 'Brisbane Lions')]

describe('deriveResultPins (wildcard10)', () => {
  it('pins nothing before any finals are played', () => {
    expect(deriveResultPins(seeds, [], 'wildcard10')).toEqual({})
  })

  it('pins wildcard losers to 9/10 in home-and-away order once both games are played', () => {
    expect(deriveResultPins(seeds, wildcards, 'wildcard10')).toEqual({ Melbourne: 9, Collingwood: 10 })
  })

  it('does not pin a pair while only one of its games is played', () => {
    const pins = deriveResultPins(seeds, [wildcards[0]], 'wildcard10')
    expect(pins).toEqual({})
  })

  it('pins elimination losers 7/8 by effective seed after week 2', () => {
    const pins = deriveResultPins(seeds, [...wildcards, ...week2], 'wildcard10')
    expect(pins).toEqual({ Melbourne: 9, Collingwood: 10, 'Western Bulldogs': 7, Carlton: 8 })
  })

  it('pins prelim losers 3/4 by seed once both prelims are played', () => {
    const pins = deriveResultPins(seeds, [...wildcards, ...week2, ...semis, ...prelims], 'wildcard10')
    expect(pins).toEqual({
      'Sydney Swans': 3, Hawthorn: 4,
      Geelong: 5, 'Adelaide Crows': 6,
      'Western Bulldogs': 7, Carlton: 8,
      Melbourne: 9, Collingwood: 10,
    })
  })

  it('pins every position once the grand final is played (the real 2026 ladder)', () => {
    const all = [...wildcards, ...week2, ...semis, ...prelims, ...grandFinal]
    expect(deriveResultPins(seeds, all, 'wildcard10')).toEqual({
      'Brisbane Lions': 1, Fremantle: 2,
      'Sydney Swans': 3, Hawthorn: 4,
      Geelong: 5, 'Adelaide Crows': 6,
      'Western Bulldogs': 7, Carlton: 8,
      Melbourne: 9, Collingwood: 10,
    })
  })
})

describe('deriveResultPins (top8)', () => {
  const top8 = seeds.slice(0, 8)
  it('uses seeds 7/8 directly with no wildcard round', () => {
    const efs = [game('Geelong', 'Western Bulldogs', 'Geelong'), game('Adelaide Crows', 'Melbourne', 'Melbourne')]
    const pins = deriveResultPins(top8, efs, 'top8')
    // Losers: Bulldogs (seed 8) and Adelaide (seed 6) → ordered by seed: Adelaide 7th, Bulldogs 8th
    expect(pins).toEqual({ 'Adelaide Crows': 7, 'Western Bulldogs': 8 })
  })
})

describe('computeBracket + computeFinalStandings', () => {
  it('locks real results and keeps picks only while participants match', () => {
    const state = computeBracket(seeds, { SF1: 'Geelong', QF2: 'Sydney Swans' }, [...wildcards, ...week2], 'wildcard10')
    expect(state.QF1.locked).toBe(true)
    expect(state.QF1.winner).toBe('Fremantle')
    expect(state.QF2.locked).toBe(true)          // real result beats the pick
    expect(state.QF2.winner).toBe('Brisbane Lions')
    expect(state.SF1.a).toBe('Hawthorn')          // QF1 loser
    expect(state.SF1.b).toBe('Geelong')           // EF1 winner
    expect(state.SF1.winner).toBe('Geelong')      // pick still valid
    expect(computeFinalStandings(state, seeds, rest, 'wildcard10')).toBeNull()
  })

  it('produces the real 2026 18-team ladder when everything is decided', () => {
    const all = [...wildcards, ...week2, ...semis, ...prelims, ...grandFinal]
    const state = computeBracket(seeds, {}, all, 'wildcard10')
    const standings = computeFinalStandings(state, seeds, rest, 'wildcard10')!
    expect(standings.slice(0, 10)).toEqual([
      'Brisbane Lions', 'Fremantle', 'Sydney Swans', 'Hawthorn', 'Geelong',
      'Adelaide Crows', 'Western Bulldogs', 'Carlton', 'Melbourne', 'Collingwood',
    ])
    expect(standings.slice(10)).toEqual(rest)
    expect(new Set(standings).size).toBe(18)
  })
})
