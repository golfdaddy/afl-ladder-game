import { Request, Response } from 'express'
import { db } from '../db'
import { isFantasy7Enabled } from '../middleware/fantasyFeature'
import { FantasyIngestionService } from '../services/fantasy/ingestion'
import { getFantasyProvider } from '../services/fantasy/providerFactory'
import { FantasyPricingService } from '../services/fantasy/pricing'
import { FantasyScoringService } from '../services/fantasy/scoring'

export class FantasyAdminController {
  static async health(_req: Request, res: Response) {
    try {
      const provider = getFantasyProvider()
      const providerHealth = await provider.getHealth()
      const counts = await db.query(
        `SELECT
          (SELECT COUNT(*) FROM fantasy_rounds)::int as "rounds",
          (SELECT COUNT(*) FROM fantasy_players)::int as "players",
          (SELECT COUNT(*) FROM fantasy_competitions)::int as "competitions"`
      )

      res.json({
        featureEnabled: isFantasy7Enabled(),
        provider: providerHealth,
        counts: counts.rows[0],
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to fetch fantasy health' })
    }
  }

  static async syncRound(req: Request, res: Response) {
    try {
      const roundId = Number(req.params.roundId)
      if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid roundId' })
      const result = await FantasyIngestionService.syncRound(roundId)
      res.json({ message: 'Fantasy round sync complete', ...result })
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Fantasy round sync failed' })
    }
  }

  static async priceRound(req: Request, res: Response) {
    try {
      const roundId = Number(req.params.roundId)
      if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid roundId' })
      const result = await FantasyPricingService.computeRoundPricing(roundId)
      res.json({ message: 'Fantasy round pricing updated', ...result })
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Fantasy pricing failed' })
    }
  }

  static async ingestScores(req: Request, res: Response) {
    try {
      const roundId = Number(req.params.roundId)
      if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid roundId' })
      const ingest = await FantasyScoringService.ingestRoundScores(roundId)
      const recompute = await FantasyScoringService.recomputeRound(roundId)
      res.json({
        message: 'Fantasy scores ingested and rankings recomputed',
        ingest,
        recompute,
      })
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Fantasy score ingestion failed' })
    }
  }

  static async recomputeRound(req: Request, res: Response) {
    try {
      const roundId = Number(req.params.roundId)
      if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid roundId' })
      const recompute = await FantasyScoringService.recomputeRound(roundId)
      res.json({ message: 'Fantasy rankings recomputed', ...recompute })
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Fantasy recompute failed' })
    }
  }
}
