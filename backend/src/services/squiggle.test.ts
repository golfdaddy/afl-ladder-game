import { applyPositionPins, resolveTeamName, SquiggleMappedTeam } from './squiggle'

const names = [
  'Fremantle', 'Sydney Swans', 'Brisbane Lions', 'Hawthorn', 'Geelong', 'Adelaide Crows',
  'Melbourne', 'Western Bulldogs', 'Collingwood', 'Carlton',
  'St Kilda', 'GWS Giants', 'Gold Coast Suns', 'North Melbourne', 'Port Adelaide',
  'West Coast Eagles', 'Richmond', 'Essendon',
]
const ladder: SquiggleMappedTeam[] = names.map((teamName, i) => ({
  position: i + 1, teamName, wins: 20 - i, losses: i + 3, draws: 0,
  pointsFor: 2000, pointsAgainst: 1500, percentage: 120,
}))

describe('applyPositionPins', () => {
  it('re-seats pinned teams and keeps everyone else in relative order', () => {
    const out = applyPositionPins(ladder, { 'Brisbane Lions': 1, Fremantle: 2, Melbourne: 9, Collingwood: 10 })
    expect(out.slice(0, 10).map(t => t.teamName)).toEqual([
      'Brisbane Lions', 'Fremantle', 'Sydney Swans', 'Hawthorn', 'Geelong',
      'Adelaide Crows', 'Western Bulldogs', 'Carlton', 'Melbourne', 'Collingwood',
    ])
    expect(out.map(t => t.position)).toEqual(names.map((_, i) => i + 1))
    expect(out.slice(10).map(t => t.teamName)).toEqual(names.slice(10))
  })

  it('returns the ladder untouched with no pins, a missing team, or conflicting positions', () => {
    expect(applyPositionPins(ladder, {})).toBe(ladder)
    expect(applyPositionPins(ladder, { Fitzroy: 1 })).toBe(ladder)
    expect(applyPositionPins(ladder, { Fremantle: 1, Melbourne: 1 })).toBe(ladder)
    expect(applyPositionPins(ladder, { Fremantle: 19 })).toBe(ladder)
  })
})

describe('resolveTeamName', () => {
  it('maps known Squiggle names and their variants', () => {
    expect(resolveTeamName('Brisbane')).toBe('Brisbane Lions')
    expect(resolveTeamName('Brisbane Lions')).toBe('Brisbane Lions')
    expect(resolveTeamName('brisbane lions')).toBe('Brisbane Lions')
    expect(resolveTeamName('Greater Western Sydney')).toBe('GWS Giants')
    expect(resolveTeamName('Gold Coast Suns')).toBe('Gold Coast Suns')
    expect(resolveTeamName('West Coast Eagles')).toBe('West Coast Eagles')
  })

  it('passes unknown names through unchanged', () => {
    expect(resolveTeamName('Tasmania Devils')).toBe('Tasmania Devils')
  })
})
