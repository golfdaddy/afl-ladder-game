import { db } from '../../db'
import { FantasyPlayerModel } from '../../models/fantasyPlayer'

export function scoreToPriceBucket(score: number): number {
  if (score < 60) return 1
  if (score < 75) return 2
  if (score < 90) return 3
  if (score < 105) return 4
  return 5
}

export class FantasyPricingService {
  static async computeRoundPricing(roundId: number): Promise<{
    roundId: number
    updatedPlayers: number
  }> {
    const roundResult = await db.query(
      `SELECT r.id, r.season_id as "seasonId", r.round_no as "roundNo"
       FROM fantasy_rounds r
       WHERE r.id = $1`,
      [roundId]
    )
    if (!roundResult.rows[0]) {
      throw new Error('Fantasy round not found')
    }

    const round = roundResult.rows[0]
    const playersResult = await db.query(
      `SELECT player_id as "playerId", avg_score as "avgScore", lock_at as "lockAt", is_available as "isAvailable"
       FROM fantasy_round_players
       WHERE round_id = $1`,
      [roundId]
    )

    for (const row of playersResult.rows) {
      const recentScores = await FantasyPlayerModel.getRecentCompletedScores(
        row.playerId,
        round.seasonId,
        round.roundNo,
        3
      )

      const effectiveAverage = recentScores.length > 0
        ? recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length
        : Number(row.avgScore)

      const priceBucket = scoreToPriceBucket(effectiveAverage)

      await db.query(
        `UPDATE fantasy_round_players
         SET avg_score = $2, price_bucket = $3, updated_at = NOW()
         WHERE round_id = $1 AND player_id = $4`,
        [roundId, Number(effectiveAverage.toFixed(2)), priceBucket, row.playerId]
      )
    }

    return {
      roundId,
      updatedPlayers: playersResult.rows.length,
    }
  }
}
