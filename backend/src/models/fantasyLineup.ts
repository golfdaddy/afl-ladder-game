import { db } from '../db'
import { FantasySlotCode } from './fantasyTypes'

export interface FantasyLineupSlot {
  id: number
  slotCode: FantasySlotCode
  playerId: number
  priceAtSubmit: number
  pointsAwarded: number | null
  lockedAt: Date | null
}

export interface FantasyLineup {
  id: number
  competitionId: number
  userId: number
  roundId: number
  totalCost: number
  totalPoints: number | null
  submittedAt: Date
  updatedAt: Date
  slots: FantasyLineupSlot[]
}

export class FantasyLineupModel {
  static async findByCompetitionRoundUser(
    competitionId: number,
    roundId: number,
    userId: number
  ): Promise<FantasyLineup | null> {
    const lineupResult = await db.query(
      `SELECT id, competition_id as "competitionId", user_id as "userId", round_id as "roundId",
              total_cost as "totalCost", total_points as "totalPoints",
              submitted_at as "submittedAt", updated_at as "updatedAt"
       FROM fantasy_lineups
       WHERE competition_id = $1 AND round_id = $2 AND user_id = $3`,
      [competitionId, roundId, userId]
    )
    if (!lineupResult.rows[0]) return null

    const lineup = lineupResult.rows[0]
    const slotsResult = await db.query(
      `SELECT id, slot_code as "slotCode", player_id as "playerId",
              price_at_submit as "priceAtSubmit", points_awarded as "pointsAwarded",
              locked_at as "lockedAt"
       FROM fantasy_lineup_slots
       WHERE lineup_id = $1
       ORDER BY slot_code ASC`,
      [lineup.id]
    )

    return {
      ...lineup,
      totalCost: Number(lineup.totalCost),
      totalPoints: lineup.totalPoints === null ? null : Number(lineup.totalPoints),
      slots: slotsResult.rows.map((row: any) => ({
        ...row,
        priceAtSubmit: Number(row.priceAtSubmit),
        pointsAwarded: row.pointsAwarded === null ? null : Number(row.pointsAwarded),
      })),
    }
  }

  static async upsertLineup(
    competitionId: number,
    roundId: number,
    userId: number,
    totalCost: number,
    slots: Array<{
      slotCode: FantasySlotCode
      playerId: number
      priceAtSubmit: number
      lockedAt: Date | null
    }>
  ): Promise<FantasyLineup> {
    return db.transaction(async (client) => {
      const lineupResult = await client.query(
        `INSERT INTO fantasy_lineups
           (competition_id, user_id, round_id, total_cost, total_points, submitted_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, NOW(), NOW())
         ON CONFLICT (competition_id, user_id, round_id)
         DO UPDATE SET total_cost = $4, updated_at = NOW()
         RETURNING id, competition_id as "competitionId", user_id as "userId", round_id as "roundId",
                   total_cost as "totalCost", total_points as "totalPoints",
                   submitted_at as "submittedAt", updated_at as "updatedAt"`,
        [competitionId, userId, roundId, totalCost]
      )

      const lineup = lineupResult.rows[0]

      await client.query(
        `DELETE FROM fantasy_lineup_slots WHERE lineup_id = $1`,
        [lineup.id]
      )

      for (const slot of slots) {
        await client.query(
          `INSERT INTO fantasy_lineup_slots
             (lineup_id, slot_code, player_id, price_at_submit, points_awarded, locked_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NULL, $5, NOW(), NOW())`,
          [lineup.id, slot.slotCode, slot.playerId, slot.priceAtSubmit, slot.lockedAt]
        )
      }

      const refetched = await client.query(
        `SELECT id, slot_code as "slotCode", player_id as "playerId",
                price_at_submit as "priceAtSubmit", points_awarded as "pointsAwarded",
                locked_at as "lockedAt"
         FROM fantasy_lineup_slots
         WHERE lineup_id = $1
         ORDER BY slot_code ASC`,
        [lineup.id]
      )

      return {
        ...lineup,
        totalCost: Number(lineup.totalCost),
        totalPoints: lineup.totalPoints === null ? null : Number(lineup.totalPoints),
        slots: refetched.rows.map((row: any) => ({
          ...row,
          priceAtSubmit: Number(row.priceAtSubmit),
          pointsAwarded: row.pointsAwarded === null ? null : Number(row.pointsAwarded),
        })),
      }
    })
  }

  static async listByCompetitionRound(competitionId: number, roundId: number): Promise<FantasyLineup[]> {
    const lineupsResult = await db.query(
      `SELECT id, competition_id as "competitionId", user_id as "userId", round_id as "roundId",
              total_cost as "totalCost", total_points as "totalPoints",
              submitted_at as "submittedAt", updated_at as "updatedAt"
       FROM fantasy_lineups
       WHERE competition_id = $1 AND round_id = $2`,
      [competitionId, roundId]
    )

    const lineups: FantasyLineup[] = []
    for (const lineup of lineupsResult.rows) {
      const slotsResult = await db.query(
        `SELECT id, slot_code as "slotCode", player_id as "playerId",
                price_at_submit as "priceAtSubmit", points_awarded as "pointsAwarded",
                locked_at as "lockedAt"
         FROM fantasy_lineup_slots
         WHERE lineup_id = $1
         ORDER BY slot_code ASC`,
        [lineup.id]
      )

      lineups.push({
        ...lineup,
        totalCost: Number(lineup.totalCost),
        totalPoints: lineup.totalPoints === null ? null : Number(lineup.totalPoints),
        slots: slotsResult.rows.map((row: any) => ({
          ...row,
          priceAtSubmit: Number(row.priceAtSubmit),
          pointsAwarded: row.pointsAwarded === null ? null : Number(row.pointsAwarded),
        })),
      })
    }
    return lineups
  }

  static async setLineupPoints(
    lineupId: number,
    totalPoints: number,
    slotPoints: Array<{ slotId: number; points: number }>
  ): Promise<void> {
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE fantasy_lineups
         SET total_points = $2, updated_at = NOW()
         WHERE id = $1`,
        [lineupId, totalPoints]
      )

      for (const slot of slotPoints) {
        await client.query(
          `UPDATE fantasy_lineup_slots
           SET points_awarded = $2, updated_at = NOW()
           WHERE id = $1`,
          [slot.slotId, slot.points]
        )
      }
    })
  }
}
