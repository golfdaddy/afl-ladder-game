export type FantasyPosition = 'BACK' | 'MID' | 'FWD' | 'RUCK'
export type FantasySlotCode = 'B1' | 'B2' | 'M1' | 'M2' | 'F1' | 'F2' | 'R1'

export const FANTASY_SLOTS: FantasySlotCode[] = ['B1', 'B2', 'M1', 'M2', 'F1', 'F2', 'R1']

export const SLOT_POSITION: Record<FantasySlotCode, FantasyPosition> = {
  B1: 'BACK',
  B2: 'BACK',
  M1: 'MID',
  M2: 'MID',
  F1: 'FWD',
  F2: 'FWD',
  R1: 'RUCK',
}

export const FANTASY_SALARY_CAP = 25

export interface FantasyCompetition {
  id: number
  name: string
  description: string | null
  isPublic: boolean
  joinCode: string
  seasonId: number
  startRound: number
  endRound: number
  memberCount?: number
}

export interface FantasyRound {
  id: number
  seasonId: number
  roundNo: number
  status: 'open' | 'live' | 'final'
  startsAt: string
  endsAt: string
}

export interface FantasyRoundPlayer {
  playerId: number
  externalId: string
  fullName: string
  aflTeam: string
  avgScore: number
  priceBucket: number
  lockAt: string
  isAvailable: boolean
  positions: FantasyPosition[]
  fantasyPoints: number | null
  scoreFinal: boolean
}

export interface FantasyLineupSlot {
  id: number
  slotCode: FantasySlotCode
  playerId: number
  priceAtSubmit: number
  pointsAwarded: number | null
  lockedAt: string | null
  isLocked: boolean
}

export interface FantasyLineup {
  id: number
  competitionId: number
  userId: number
  roundId: number
  totalCost: number
  totalPoints: number | null
  submittedAt: string
  updatedAt: string
  slots: FantasyLineupSlot[]
}

export interface FantasyLeaderboardEntry {
  userId: number
  displayName: string
  points: number
  salaryUsed: number
  submittedAt: string
  rank: number
}
