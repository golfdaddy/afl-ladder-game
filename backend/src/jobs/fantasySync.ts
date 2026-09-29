import { db } from '../db'
import { FantasyIngestionService } from '../services/fantasy/ingestion'
import { FantasyPricingService } from '../services/fantasy/pricing'
import { FantasyScoringService } from '../services/fantasy/scoring'

export async function runFantasySyncJobs(): Promise<void> {
  if (process.env.FEATURE_FANTASY7_ENABLED !== 'true') {
    return
  }

  try {
    const roundsResult = await db.query(
      `SELECT id
       FROM fantasy_rounds
       WHERE starts_at <= NOW() + INTERVAL '2 day'
         AND ends_at >= NOW() - INTERVAL '1 day'
       ORDER BY starts_at ASC
       LIMIT 3`
    )

    for (const row of roundsResult.rows) {
      const roundId = Number(row.id)
      await FantasyIngestionService.syncRound(roundId)
      await FantasyPricingService.computeRoundPricing(roundId)
      await FantasyScoringService.ingestRoundScores(roundId)
      await FantasyScoringService.recomputeRound(roundId)
    }
  } catch (error: any) {
    console.error('[FantasySync] failed:', error?.message || error)
  }
}
