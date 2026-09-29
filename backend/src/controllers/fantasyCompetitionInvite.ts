import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { FantasyCompetitionInviteModel } from '../models/fantasyCompetitionInvite'
import { FantasyCompetitionModel } from '../models/fantasyCompetition'
import { UserModel } from '../models/user'

export class FantasyCompetitionInviteController {
  static async invite(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.id)
      const email = String(req.body?.email || '').trim().toLowerCase()
      if (!competitionId || !email) return res.status(400).json({ error: 'Competition and email are required' })

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address' })

      const competition = await FantasyCompetitionModel.findById(competitionId)
      if (!competition) return res.status(404).json({ error: 'Competition not found' })

      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember) return res.status(403).json({ error: 'Only members can send invites' })

      const existingInvite = await FantasyCompetitionInviteModel.findByCompetitionAndEmail(competitionId, email)
      if (existingInvite?.status === 'pending') {
        return res.status(400).json({ error: 'An invite is already pending for this email' })
      }
      if (existingInvite?.status === 'declined') {
        await FantasyCompetitionInviteModel.deleteInvite(existingInvite.id)
      }

      const existingUser = await UserModel.findByEmail(email)
      if (existingUser) {
        const alreadyMember = await FantasyCompetitionModel.isMember(competitionId, existingUser.id)
        if (alreadyMember) {
          return res.status(400).json({ error: 'User is already a member of this competition' })
        }
      }

      const invite = await FantasyCompetitionInviteModel.create(competitionId, req.userId, email)
      res.status(201).json({ invite, message: `Invite created for ${email}` })
    } catch (error: any) {
      console.error('Fantasy invite error:', error)
      if (error?.constraint === 'fantasy_competition_invites_competition_id_email_key') {
        return res.status(400).json({ error: 'An invite is already pending for this email' })
      }
      res.status(500).json({ error: 'Failed to create invite' })
    }
  }

  static async getCompetitionInvites(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const competitionId = Number(req.params.id)
      if (!Number.isFinite(competitionId)) return res.status(400).json({ error: 'Invalid competition id' })

      const isMember = await FantasyCompetitionModel.isMember(competitionId, req.userId)
      if (!isMember) return res.status(403).json({ error: 'Access denied' })

      const invites = await FantasyCompetitionInviteModel.getByCompetition(competitionId)
      res.json({ invites })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invites' })
    }
  }

  static async getMyInvites(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const user = await UserModel.findById(req.userId)
      if (!user) return res.status(404).json({ error: 'User not found' })
      const invites = await FantasyCompetitionInviteModel.getPendingByEmail(user.email.toLowerCase())
      res.json({ invites })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invites' })
    }
  }

  static async acceptInvite(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const token = String(req.params.token || '')
      const invite = await FantasyCompetitionInviteModel.findByToken(token)
      if (!invite) return res.status(404).json({ error: 'Invite not found' })
      if (invite.status !== 'pending') return res.status(400).json({ error: `Invite is already ${invite.status}` })

      const user = await UserModel.findById(req.userId)
      if (!user) return res.status(404).json({ error: 'User not found' })
      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({ error: 'Invite email does not match your account email' })
      }

      await FantasyCompetitionModel.addMember(invite.competitionId, req.userId)
      await FantasyCompetitionInviteModel.acceptInvite(invite.id)
      res.json({ message: 'Successfully joined fantasy competition', competitionId: invite.competitionId })
    } catch (error) {
      res.status(500).json({ error: 'Failed to accept invite' })
    }
  }

  static async declineInvite(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
      const token = String(req.params.token || '')
      const invite = await FantasyCompetitionInviteModel.findByToken(token)
      if (!invite) return res.status(404).json({ error: 'Invite not found' })
      if (invite.status !== 'pending') return res.status(400).json({ error: `Invite is already ${invite.status}` })

      const user = await UserModel.findById(req.userId)
      if (!user) return res.status(404).json({ error: 'User not found' })
      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({ error: 'Invite email does not match your account email' })
      }

      await FantasyCompetitionInviteModel.declineInvite(invite.id)
      res.json({ message: 'Invite declined' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to decline invite' })
    }
  }
}
