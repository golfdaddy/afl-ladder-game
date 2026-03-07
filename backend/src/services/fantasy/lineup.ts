import { db } from '../../db'
import { FantasyCompetitionModel } from '../../models/fantasyCompetition'
import { FantasyLineup, FantasyLineupModel } from '../../models/fantasyLineup'
import { FantasyPlayerModel } from '../../models/fantasyPlayer'
import {
  FANTASY_SALARY_CAP,
  FANTASY_SLOT_CODES,
  FANTASY_SLOT_POSITION,
  FantasyLineupInput,
  FantasySlotCode,
} from '../../models/fantasyTypes'

type CompetitionRoundContext = {
  competitionId: number
  seasonId: number
  startRound: number
  endRound: number
  roundId: number
  roundNo: number
}

export class FantasyLineupService {
  static async getCompetitionRoundContext(
    competitionId: number,
    roundId: number
  ): Promise<CompetitionRoundContext | null> {
    const result = await db.query(
      `SELECT c.id as "competitionId", c.season_id as "seasonId",
              c.start_round as "startRound", c.end_round as "endRound",
              r.id as "roundId", r.round_no as "roundNo"
       FROM fantasy_competitions c
       JOIN fantasy_rounds r ON r.id = $2 AND r.season_id = c.season_id
       WHERE c.id = $1`,
      [competitionId, roundId]
    )
    const row = result.rows[0]
    if (!row) return null
    if (row.roundNo < row.startRound || row.roundNo > row.endRound) return null
    return row
  }

  static async getMyLineup(competitionId: number, roundId: number, userId: number) {
    const lineup = await FantasyLineupModel.findByCompetitionRoundUser(competitionId, roundId, userId)
    return this.toLineupResponse(lineup)
  }

  static toLineupResponse(lineup: FantasyLineup | null) {
    if (!lineup) return null
    const now = new Date()
    return {
      ...lineup,
      slots: lineup.slots.map((slot) => ({
        ...slot,
        isLocked: slot.lockedAt ? new Date(slot.lockedAt) <= now : false,
      })),
    }
  }

  static async submitMyLineup(
    competitionId: number,
    roundId: number,
    userId: number,
    input: FantasyLineupInput
  ) {
    const context = await this.getCompetitionRoundContext(competitionId, roundId)
    if (!context) {
      throw new Error('Invalid competition or round')
    }

    const isMember = await FantasyCompetitionModel.isMember(competitionId, userId)
    if (!isMember) {
      throw new Error('Only competition members can submit lineups')
    }

    if (!Array.isArray(input.slots) || input.slots.length !== FANTASY_SLOT_CODES.length) {
      throw new Error('Lineup must contain exactly 7 slots')
    }

    const seenSlots = new Set<string>()
    const seenPlayers = new Set<number>()
    const bySlot = new Map<FantasySlotCode, number>()

    for (const entry of input.slots) {
      if (!FANTASY_SLOT_CODES.includes(entry.slotCode)) {
        throw new Error(`Invalid slot code: ${entry.slotCode}`)
      }
      if (seenSlots.has(entry.slotCode)) {
        throw new Error(`Duplicate slot code: ${entry.slotCode}`)
      }
      if (seenPlayers.has(entry.playerId)) {
        throw new Error('A player can only be selected once')
      }
      seenSlots.add(entry.slotCode)
      seenPlayers.add(entry.playerId)
      bySlot.set(entry.slotCode, entry.playerId)
    }

    for (const requiredSlot of FANTASY_SLOT_CODES) {
      if (!bySlot.has(requiredSlot)) {
        throw new Error(`Missing slot: ${requiredSlot}`)
      }
    }

    const roundPlayers = await FantasyPlayerModel.listRoundPlayers(roundId)
    const roundPlayerMap = new Map(roundPlayers.map((p) => [p.playerId, p]))

    const existing = await FantasyLineupModel.findByCompetitionRoundUser(competitionId, roundId, userId)
    const now = new Date()

    if (existing) {
      for (const lockedSlot of existing.slots) {
        const isLocked = lockedSlot.lockedAt ? new Date(lockedSlot.lockedAt) <= now : false
        if (!isLocked) continue
        const incomingPlayer = bySlot.get(lockedSlot.slotCode)
        if (incomingPlayer !== lockedSlot.playerId) {
          throw new Error(`Slot ${lockedSlot.slotCode} is locked and cannot be changed`)
        }
      }
    }

    let totalCost = 0
    const validatedSlots: Array<{
      slotCode: FantasySlotCode
      playerId: number
      priceAtSubmit: number
      lockedAt: Date | null
    }> = []

    for (const slotCode of FANTASY_SLOT_CODES) {
      const playerId = bySlot.get(slotCode)!
      const player = roundPlayerMap.get(playerId)
      if (!player || !player.isAvailable) {
        throw new Error(`Selected player for ${slotCode} is not available`)
      }

      const requiredPosition = FANTASY_SLOT_POSITION[slotCode]
      if (!player.positions.includes(requiredPosition)) {
        throw new Error(`${player.fullName} is not eligible for ${slotCode}`)
      }

      const isPlayerLocked = new Date(player.lockAt) <= now
      const previousSlotSelection = existing?.slots.find((slot) => slot.slotCode === slotCode)
      if (isPlayerLocked && previousSlotSelection?.playerId !== playerId) {
        throw new Error(`${player.fullName} is already locked and cannot be newly selected`)
      }

      totalCost += player.priceBucket
      validatedSlots.push({
        slotCode,
        playerId,
        priceAtSubmit: player.priceBucket,
        lockedAt: player.lockAt ? new Date(player.lockAt) : null,
      })
    }

    if (totalCost > FANTASY_SALARY_CAP) {
      throw new Error(`Salary cap exceeded (${totalCost}/${FANTASY_SALARY_CAP})`)
    }

    const saved = await FantasyLineupModel.upsertLineup(
      competitionId,
      roundId,
      userId,
      totalCost,
      validatedSlots
    )

    return this.toLineupResponse(saved)
  }
}
