import { FantasyPosition, FantasyRoundStatus } from '../../models/fantasyTypes'

export interface FantasyProviderRound {
  seasonYear: number
  roundNo: number
  startsAt: Date
  endsAt: Date
  status: FantasyRoundStatus
}

export interface FantasyProviderPlayer {
  externalId: string
  fullName: string
  aflTeam: string
  positions: FantasyPosition[]
  averageScore: number
  lockAt: Date
  isAvailable: boolean
}

export interface FantasyProviderPlayerScore {
  externalId: string
  fantasyPoints: number
  sourceUpdatedAt: Date
  isFinal: boolean
}

export interface FantasyProviderHealth {
  provider: string
  ok: boolean
  checkedAt: Date
  details?: string
}

export interface FantasyProvider {
  getProviderName(): string
  getHealth(): Promise<FantasyProviderHealth>
  fetchRoundPlayers(input: { seasonYear: number; roundNo: number }): Promise<{
    round: FantasyProviderRound
    players: FantasyProviderPlayer[]
  }>
  fetchRoundScores(input: { seasonYear: number; roundNo: number }): Promise<FantasyProviderPlayerScore[]>
}
