import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { CompetitionModel } from '../models/competition'
import { CompetitionInviteModel } from '../models/competitionInvite'
import { SeasonModel } from '../models/season'

export class CompetitionController {
  static async create(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { seasonId, name, description, isPublic } = req.body

      if (!seasonId || !name) {
        return res.status(400).json({ error: 'Season ID and name are required' })
      }

      // Verify season exists
      const season = await SeasonModel.getSeasonById(seasonId)
      if (!season) {
        return res.status(400).json({ error: 'Invalid season' })
      }

      const competition = await CompetitionModel.create(
        req.userId,
        seasonId,
        name,
        description || null,
        isPublic || false
      )

      // Add creator as league_admin
      await CompetitionModel.addMember(competition.id, req.userId, 'league_admin')

      res.status(201).json({ competition })
    } catch (error) {
      console.error('Competition creation error:', error)
      res.status(500).json({ error: 'Failed to create competition' })
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id } = req.params
      const competition = await CompetitionModel.findById(parseInt(id))

      if (!competition) {
        return res.status(404).json({ error: 'Competition not found' })
      }

      // Check if user is member or it's public
      const isMember = await CompetitionModel.isMember(competition.id, req.userId)
      if (!isMember && !competition.isPublic) {
        return res.status(403).json({ error: 'Unauthorized' })
      }

      const members = await CompetitionModel.getMembers(competition.id)
      const currentUserMemberRole = await CompetitionModel.getMemberRole(competition.id, req.userId)

      // Gracefully handle invites — table may not exist yet if migration 002 hasn't been run
      let pendingInvites: any[] = []
      try {
        const invites = await CompetitionInviteModel.getByCompetition(competition.id)
        pendingInvites = invites
          .filter((inv: any) => inv.status === 'pending')
          .map((inv: any) => ({
            id: inv.id,
            email: inv.email,
            status: 'invited' as const,
            invitedByName: inv.invitedByName,
            createdAt: inv.createdAt,
            displayName: inv.email.split('@')[0],
            hasSubmitted: false,
            submittedAt: null,
            predictionUpdatedAt: null,
            isInvite: true
          }))
      } catch (_) {
        // Invite table not yet created — return empty list
      }

      res.json({ competition, members, pendingInvites, currentUserMemberRole })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch competition' })
    }
  }

  static async getUserCompetitions(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const competitions = await CompetitionModel.getUserCompetitions(req.userId)
      res.json({ competitions })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch competitions' })
    }
  }

  static async join(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { joinCode } = req.body

      if (!joinCode) {
        return res.status(400).json({ error: 'Join code is required' })
      }

      const competition = await CompetitionModel.findByJoinCode(joinCode)
      if (!competition) {
        return res.status(404).json({ error: 'Competition not found' })
      }

      // Check if already member
      const isMember = await CompetitionModel.isMember(competition.id, req.userId)
      if (isMember) {
        return res.status(400).json({ error: 'Already a member of this competition' })
      }

      await CompetitionModel.addMember(competition.id, req.userId)

      // Auto-accept any pending invite for this user + competition
      const user = await (await import('../models/user')).UserModel.findById(req.userId)
      if (user) {
        const existingInvite = await CompetitionInviteModel.findByCompetitionAndEmail(
          competition.id,
          user.email.toLowerCase()
        )
        if (existingInvite && existingInvite.status === 'pending') {
          await CompetitionInviteModel.acceptInvite(existingInvite.id)
        }
      }

      res.json({ competition, message: 'Successfully joined competition' })
    } catch (error) {
      console.error('Competition join error:', error)
      res.status(500).json({ error: 'Failed to join competition' })
    }
  }

  static async getPublic(req: AuthRequest, res: Response) {
    try {
      const { seasonId } = req.query
      const limit = parseInt(req.query.limit as string) || 20
      const offset = parseInt(req.query.offset as string) || 0

      if (!seasonId) {
        return res.status(400).json({ error: 'Season ID is required' })
      }

      const competitions = await CompetitionModel.getPublicCompetitions(
        parseInt(seasonId as string),
        limit,
        offset
      )

      res.json({ competitions })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch competitions' })
    }
  }
}
