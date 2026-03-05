import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { FantasyCompetitionModel } from '../models/fantasyCompetition'
import { FantasyPlayerModel } from '../models/fantasyPlayer'
import { FantasyRoundModel } from '../models/fantasyRound'
import { FantasyLineupService } from '../services/fantasy/lineup'

export class FantasyRoundController {
  static async getCurrentRound(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.query.competitionId)
      if (!Number.isFinite(competitionId)) {
        return res.status(400).json({ error: 'competitionId is required' })
      }

      const competition = await FantasyCompetitionModel.findById(competitionId)
      if (!competition) return res.status(404).json({ error: 'Competition not found' })

      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember && !competition.isPublic) {
        return res.status(403).json({ error: 'Access denied' })
      }

      const round = await FantasyRoundModel.getCurrentByCompetitionId(competitionId)
      if (!round) {
        return res.status(404).json({ error: 'No active rounds found for this competition' })
      }

      res.json({ round })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch current round' })
    }
  }

  static async getRoundPlayers(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.query.competitionId)
      const roundId = Number(req.query.roundId)
      if (!Number.isFinite(competitionId) || !Number.isFinite(roundId)) {
        return res.status(400).json({ error: 'competitionId and roundId are required' })
      }

      const competition = await FantasyCompetitionModel.findById(competitionId)
      if (!competition) return res.status(404).json({ error: 'Competition not found' })
      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember && !competition.isPublic) {
        return res.status(403).json({ error: 'Access denied' })
      }

      const context = await FantasyLineupService.getCompetitionRoundContext(competitionId, roundId)
      if (!context) return res.status(400).json({ error: 'Round does not belong to competition range' })

      const players = await FantasyPlayerModel.listRoundPlayers(roundId)
      res.json({ players })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch round players' })
    }
  }
}
