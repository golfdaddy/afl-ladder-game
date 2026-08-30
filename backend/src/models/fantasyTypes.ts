export const FANTASY_POSITIONS = ['BACK', 'MID', 'FWD', 'RUCK'] as const
export type FantasyPosition = typeof FANTASY_POSITIONS[number]

export const FANTASY_SLOT_CODES = ['B1', 'B2', 'M1', 'M2', 'F1', 'F2', 'R1'] as const
export type FantasySlotCode = typeof FANTASY_SLOT_CODES[number]

export const FANTASY_SLOT_POSITION: Record<FantasySlotCode, FantasyPosition> = {
  B1: 'BACK',
  B2: 'BACK',
  M1: 'MID',
  M2: 'MID',
  F1: 'FWD',
  F2: 'FWD',
  R1: 'RUCK',
}

export const FANTASY_SALARY_CAP = 25

export interface FantasyLineupInput {
  slots: Array<{
    slotCode: FantasySlotCode
    playerId: number
  }>
}

export interface FantasyLeaderboardEntry {
  userId: number
  displayName: string
  points: number
  salaryUsed: number
  submittedAt: Date
  rank: number
}

export type FantasyRoundStatus = 'open' | 'live' | 'final'
