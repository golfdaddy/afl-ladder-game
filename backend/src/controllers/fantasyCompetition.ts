import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { FantasyCompetitionModel } from '../models/fantasyCompetition'
import { FantasyCompetitionInviteModel } from '../models/fantasyCompetitionInvite'
import { SeasonModel } from '../models/season'
import { UserModel } from '../models/user'

export class FantasyCompetitionController {
  static async create(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

      const { seasonId, name, description, isPublic, startRound, endRound } = req.body
      if (!name || !startRound || !endRound) {
        return res.status(400).json({ error: 'name, startRound and endRound are required' })
      }
      if (Number(startRound) > Number(endRound)) {
        return res.status(400).json({ error: 'startRound must be <= endRound' })
      }

      const season = seasonId
        ? await SeasonModel.getSeasonById(Number(seasonId))
        : await SeasonModel.getCurrentSeason()
      if (!season) {
        return res.status(400).json({ error: 'No valid season found' })
      }

      const competition = await FantasyCompetitionModel.create(
        req.userId,
        season.id,
        String(name).trim(),
        description ? String(description).trim() : null,
        Boolean(isPublic),
        Number(startRound),
        Number(endRound)
      )
      await FantasyCompetitionModel.addMember(competition.id, req.userId, 'league_admin')

      res.status(201).json({ competition })
    } catch (error) {
      console.error('Fantasy competition create error:', error)
      res.status(500).json({ error: 'Failed to create fantasy competition' })
    }
  }

  static async getUserCompetitions(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitions = await FantasyCompetitionModel.getUserCompetitions(req.userId)
      res.json({ competitions })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch competitions' })
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.id)
      if (!Number.isFinite(competitionId)) return res.status(400).json({ error: 'Invalid competition id' })

      const competition = await FantasyCompetitionModel.findById(competitionId)
      if (!competition) return res.status(404).json({ error: 'Competition not found' })

      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember && !competition.isPublic) {
        return res.status(403).json({ error: 'Access denied' })
      }

      const members = await FantasyCompetitionModel.getMembers(competitionId)
      const currentUserMemberRole = await FantasyCompetitionModel.getMemberRole(competitionId, req.userId)
      const invites = await FantasyCompetitionInviteModel.getByCompetition(competitionId)
      const pendingInvites = invites.filter((inv) => inv.status === 'pending')

      res.json({ competition, members, pendingInvites, currentUserMemberRole })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch competition' })
    }
  }

  static async join(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const { joinCode } = req.body
      if (!joinCode) return res.status(400).json({ error: 'Join code is required' })

      const competition = await FantasyCompetitionModel.findByJoinCode(String(joinCode).trim().toUpperCase())
      if (!competition) return res.status(404).json({ error: 'Competition not found' })

      const isMember = await FantasyCompetitionModel.isMember(competition.id, req.userId)
      if (!isMember) {
        await FantasyCompetitionModel.addMember(competition.id, req.userId)
      }

      const user = await UserModel.findById(req.userId)
      if (user) {
        const invite = await FantasyCompetitionInviteModel.findByCompetitionAndEmail(competition.id, user.email.toLowerCase())
        if (invite && invite.status === 'pending') {
          await FantasyCompetitionInviteModel.acceptInvite(invite.id)
        }
      }

      res.json({ competition, message: isMember ? 'Already a member' : 'Successfully joined competition' })
    } catch (error) {
      console.error('Fantasy join error:', error)
      res.status(500).json({ error: 'Failed to join competition' })
    }
  }

  static async getPublic(req: AuthRequest, res: Response) {
    try {
      const seasonId = Number(req.query.seasonId)
      const limit = Number(req.query.limit || 20)
      const offset = Number(req.query.offset || 0)

      if (!Number.isFinite(seasonId)) {
        return res.status(400).json({ error: 'seasonId is required' })
      }

      const competitions = await FantasyCompetitionModel.getPublicCompetitions(seasonId, limit, offset)
      res.json({ competitions })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch competitions' })
    }
  }
}
