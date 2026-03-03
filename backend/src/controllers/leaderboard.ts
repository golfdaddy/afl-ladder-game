import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { ScoreModel } from '../models/score'
import { CompetitionModel } from '../models/competition'

export class LeaderboardController {
  static async getCompetitionLeaderboard(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { competitionId } = req.params
      const compId = parseInt(competitionId)

      // Only members (or public competitions) can see the leaderboard
      const competition = await CompetitionModel.findById(compId)
      if (!competition) {
        return res.status(404).json({ error: 'Competition not found' })
      }

      const isMember = await CompetitionModel.isMember(compId, req.userId)
      if (!isMember && !competition.isPublic) {
        return res.status(403).json({ error: 'Access denied — join this competition to view the leaderboard' })
      }

      const leaderboard = await ScoreModel.getCompetitionLeaderboard(compId)

      res.json({ leaderboard })
    } catch (error) {
      console.error('Leaderboard fetch error:', error)
      res.status(500).json({ error: 'Failed to fetch leaderboard' })
    }
  }

  static async getUserPersonalLeaderboard(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { seasonId } = req.params
      const leaderboard = await ScoreModel.getUserPersonalLeaderboard(req.userId, parseInt(seasonId))

      res.json({ leaderboard })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch leaderboard' })
    }
  }

  static async getGlobalLeaderboard(req: AuthRequest, res: Response) {
    try {
      const { seasonId } = req.params
      const limit = parseInt(req.query.limit as string) || 100

      const leaderboard = await ScoreModel.getGlobalLeaderboard(parseInt(seasonId), limit)

      res.json({ leaderboard })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch leaderboard' })
    }
  }

  static async getPointDetails(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { scoreId } = req.params
      const details = await ScoreModel.getPointDetails(parseInt(scoreId))

      res.json({ details })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch point details' })
    }
  }
}
