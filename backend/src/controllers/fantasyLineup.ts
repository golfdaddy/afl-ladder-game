import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { FantasyLineupService } from '../services/fantasy/lineup'

export class FantasyLineupController {
  static async getMyLineup(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.competitionId)
      const roundId = Number(req.params.roundId)
      if (!Number.isFinite(competitionId) || !Number.isFinite(roundId)) {
        return res.status(400).json({ error: 'Invalid competitionId or roundId' })
      }

      const lineup = await FantasyLineupService.getMyLineup(competitionId, roundId, req.userId)
      if (!lineup) return res.status(404).json({ error: 'Lineup not found' })

      res.json({ lineup })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch lineup' })
    }
  }

  static async upsertMyLineup(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.competitionId)
      const roundId = Number(req.params.roundId)
      if (!Number.isFinite(competitionId) || !Number.isFinite(roundId)) {
        return res.status(400).json({ error: 'Invalid competitionId or roundId' })
      }

      const lineup = await FantasyLineupService.submitMyLineup(competitionId, roundId, req.userId, req.body)
      res.json({ lineup })
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to submit lineup' })
    }
  }
}
