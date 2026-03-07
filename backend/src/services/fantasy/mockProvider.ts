import {
  FantasyProvider,
  FantasyProviderHealth,
  FantasyProviderPlayer,
  FantasyProviderPlayerScore,
  FantasyProviderRound,
} from './provider'
import { FantasyPosition } from '../../models/fantasyTypes'

type SeedPlayer = {
  externalId: string
  fullName: string
  aflTeam: string
  positions: FantasyPosition[]
  baseAverage: number
}

const MOCK_PLAYERS: SeedPlayer[] = [
  { externalId: 'P001', fullName: 'Lachie Whitfield', aflTeam: 'GWS Giants', positions: ['BACK'], baseAverage: 102 },
  { externalId: 'P002', fullName: 'Jack Sinclair', aflTeam: 'St Kilda', positions: ['BACK', 'MID'], baseAverage: 98 },
  { externalId: 'P003', fullName: 'Nick Daicos', aflTeam: 'Collingwood', positions: ['MID', 'BACK'], baseAverage: 110 },
  { externalId: 'P004', fullName: 'Marcus Bontempelli', aflTeam: 'Western Bulldogs', positions: ['MID'], baseAverage: 112 },
  { externalId: 'P005', fullName: 'Connor Rozee', aflTeam: 'Port Adelaide', positions: ['MID', 'FWD'], baseAverage: 94 },
  { externalId: 'P006', fullName: 'Errol Gulden', aflTeam: 'Sydney Swans', positions: ['MID', 'FWD'], baseAverage: 102 },
  { externalId: 'P007', fullName: 'Zak Butters', aflTeam: 'Port Adelaide', positions: ['MID'], baseAverage: 101 },
  { externalId: 'P008', fullName: 'Zach Merrett', aflTeam: 'Essendon', positions: ['MID'], baseAverage: 106 },
  { externalId: 'P009', fullName: 'Josh Dunkley', aflTeam: 'Brisbane Lions', positions: ['MID'], baseAverage: 99 },
  { externalId: 'P010', fullName: 'Isaac Heeney', aflTeam: 'Sydney Swans', positions: ['FWD', 'MID'], baseAverage: 108 },
  { externalId: 'P011', fullName: 'Toby Greene', aflTeam: 'GWS Giants', positions: ['FWD'], baseAverage: 87 },
  { externalId: 'P012', fullName: 'Jye Amiss', aflTeam: 'Fremantle', positions: ['FWD'], baseAverage: 66 },
  { externalId: 'P013', fullName: 'Charlie Curnow', aflTeam: 'Carlton', positions: ['FWD'], baseAverage: 74 },
  { externalId: 'P014', fullName: 'Aaron Naughton', aflTeam: 'Western Bulldogs', positions: ['FWD'], baseAverage: 71 },
  { externalId: 'P015', fullName: 'Max Gawn', aflTeam: 'Melbourne', positions: ['RUCK'], baseAverage: 103 },
  { externalId: 'P016', fullName: 'Tim English', aflTeam: 'Western Bulldogs', positions: ['RUCK'], baseAverage: 95 },
  { externalId: 'P017', fullName: 'Brodie Grundy', aflTeam: 'Sydney Swans', positions: ['RUCK'], baseAverage: 89 },
  { externalId: 'P018', fullName: 'Luke Ryan', aflTeam: 'Fremantle', positions: ['BACK'], baseAverage: 90 },
  { externalId: 'P019', fullName: 'Sam Docherty', aflTeam: 'Carlton', positions: ['BACK', 'MID'], baseAverage: 88 },
  { externalId: 'P020', fullName: 'James Sicily', aflTeam: 'Hawthorn', positions: ['BACK'], baseAverage: 93 },
  { externalId: 'P021', fullName: 'Bailey Dale', aflTeam: 'Western Bulldogs', positions: ['BACK'], baseAverage: 82 },
  { externalId: 'P022', fullName: 'Harry Sheezel', aflTeam: 'North Melbourne', positions: ['BACK', 'MID'], baseAverage: 99 },
  { externalId: 'P023', fullName: 'Caleb Serong', aflTeam: 'Fremantle', positions: ['MID'], baseAverage: 97 },
  { externalId: 'P024', fullName: 'Jordan Dawson', aflTeam: 'Adelaide Crows', positions: ['MID', 'BACK'], baseAverage: 98 },
  { externalId: 'P025', fullName: 'Tom Green', aflTeam: 'GWS Giants', positions: ['MID'], baseAverage: 92 },
  { externalId: 'P026', fullName: 'Jy Simpkin', aflTeam: 'North Melbourne', positions: ['MID', 'FWD'], baseAverage: 77 },
  { externalId: 'P027', fullName: 'Shai Bolton', aflTeam: 'Richmond', positions: ['FWD', 'MID'], baseAverage: 84 },
  { externalId: 'P028', fullName: 'Jamie Elliott', aflTeam: 'Collingwood', positions: ['FWD'], baseAverage: 69 },
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export class MockFantasyProvider implements FantasyProvider {
  getProviderName(): string {
    return 'mock'
  }

  async getHealth(): Promise<FantasyProviderHealth> {
    return {
      provider: this.getProviderName(),
      ok: true,
      checkedAt: new Date(),
      details: 'Mock provider active',
    }
  }

  async fetchRoundPlayers(input: { seasonYear: number; roundNo: number }): Promise<{
    round: FantasyProviderRound
    players: FantasyProviderPlayer[]
  }> {
    const roundStart = new Date(Date.UTC(input.seasonYear, 2, 20 + (input.roundNo - 1) * 7, 8, 0, 0))
    const roundEnd = new Date(roundStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    const now = new Date()
    const status = now < roundStart ? 'open' : (now <= roundEnd ? 'live' : 'final')

    const round: FantasyProviderRound = {
      seasonYear: input.seasonYear,
      roundNo: input.roundNo,
      startsAt: roundStart,
      endsAt: roundEnd,
      status,
    }

    const players: FantasyProviderPlayer[] = MOCK_PLAYERS.map((seed, index) => {
      const driftSeed = hashString(`${seed.externalId}-${input.roundNo}`)
      const drift = ((driftSeed % 13) - 6) * 0.8
      const avg = Math.max(40, seed.baseAverage + drift)

      const gameOffsetHours = (index % 9) * 6
      const lockAt = new Date(roundStart.getTime() + gameOffsetHours * 60 * 60 * 1000)

      return {
        externalId: seed.externalId,
        fullName: seed.fullName,
        aflTeam: seed.aflTeam,
        positions: seed.positions,
        averageScore: Math.round(avg * 10) / 10,
        lockAt,
        isAvailable: true,
      }
    })

    return { round, players }
  }

  async fetchRoundScores(input: { seasonYear: number; roundNo: number }): Promise<FantasyProviderPlayerScore[]> {
    const now = new Date()
    return MOCK_PLAYERS.map((seed) => {
      const variance = (hashString(`${seed.externalId}-score-${input.roundNo}`) % 41) - 20
      const points = Math.max(20, seed.baseAverage + variance)
      return {
        externalId: seed.externalId,
        fantasyPoints: Math.round(points * 10) / 10,
        sourceUpdatedAt: now,
        isFinal: false,
      }
    })
  }
}
