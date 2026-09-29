import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { FantasyCompetitionModel } from '../models/fantasyCompetition'
import { FantasyRankingModel } from '../models/fantasyRanking'
import { FantasyRoundModel } from '../models/fantasyRound'

export class FantasyLeaderboardController {
  static async getCompetitionWeekly(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.competitionId)
      if (!Number.isFinite(competitionId)) {
        return res.status(400).json({ error: 'Invalid competition id' })
      }

      const competition = await FantasyCompetitionModel.findById(competitionId)
      if (!competition) return res.status(404).json({ error: 'Competition not found' })

      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember && !competition.isPublic) return res.status(403).json({ error: 'Access denied' })

      let roundId = Number(req.query.roundId)
      if (!Number.isFinite(roundId)) {
        const current = await FantasyRoundModel.getCurrentByCompetitionId(competitionId)
        if (!current) return res.status(404).json({ error: 'No current round found' })
        roundId = current.id
      }

      const leaderboard = await FantasyRankingModel.getWeeklyLeaderboard(competitionId, roundId)
      res.json({ leaderboard, roundId })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch weekly leaderboard' })
    }
  }

  static async getCompetitionSeason(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.competitionId)
      if (!Number.isFinite(competitionId)) {
        return res.status(400).json({ error: 'Invalid competition id' })
      }

      const competition = await FantasyCompetitionModel.findById(competitionId)
      if (!competition) return res.status(404).json({ error: 'Competition not found' })

      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember && !competition.isPublic) return res.status(403).json({ error: 'Access denied' })

      const leaderboard = await FantasyRankingModel.getSeasonLeaderboard(competitionId)
      res.json({ leaderboard })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch season leaderboard' })
    }
  }
}
