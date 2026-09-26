import { Response } from 'express'
import { ZodError } from 'zod'
import { AuthRequest } from '../middleware/auth'
import { CompetitionModel } from '../models/competition'
import { CompetitionInviteModel } from '../models/competitionInvite'
import { UserModel } from '../models/user'
import { inviteSchema } from '../schemas/competition'
import { zodError } from '../utils/zodError'

const nodemailer = require('nodemailer')

// Create email transporter
const createTransporter = () => {
  // In development, log emails to console instead of sending
  if (process.env.NODE_ENV === 'development' && process.env.SMTP_USER === 'your-email@gmail.com') {
    return null // Will fall back to console logging
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const sendInviteEmail = async (
  toEmail: string,
  competitionName: string,
  invitedByName: string,
  inviteToken: string,
  joinCode: string
) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const inviteLink = `${frontendUrl}/invite/${inviteToken}`

  const transporter = createTransporter()

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e40af;">AFL Ladder Prediction Game</h2>
      <p>Hey there!</p>
      <p><strong>${invitedByName}</strong> has invited you to join their competition: <strong>${competitionName}</strong></p>
      <p>Predict the final AFL ladder positions for the 2026 season and compete against friends!</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${inviteLink}"
           style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Accept Invite &amp; Join
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Or join manually with this code: <strong>${joinCode}</strong></p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #9ca3af; font-size: 12px;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `

  if (transporter) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@aflladder.com',
      to: toEmail,
      subject: `${invitedByName} invited you to ${competitionName} - AFL Ladder Game`,
      html: emailHtml,
    })
    console.log(`Invite email sent to ${toEmail}`)
  } else {
    // Development fallback - log to console
    console.log('=== INVITE EMAIL (Dev Mode) ===')
    console.log(`To: ${toEmail}`)
    console.log(`Subject: ${invitedByName} invited you to ${competitionName}`)
    console.log(`Invite Link: ${inviteLink}`)
    console.log(`Join Code: ${joinCode}`)
    console.log('================================')
  }
}

export class CompetitionInviteController {
  // Send an invite to an email address
  static async invite(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id } = req.params
      const competitionId = parseInt(id)
      const { email } = inviteSchema.parse(req.body)  // validates + lowercases

      // Check competition exists
      const competition = await CompetitionModel.findById(competitionId)
      if (!competition) {
        return res.status(404).json({ error: 'Competition not found' })
      }

      // Check user is a member of the competition (only members can invite)
      const isMember = await CompetitionModel.isMember(competitionId, req.userId)
      if (!isMember) {
        return res.status(403).json({ error: 'Only members can invite others' })
      }

      // Check if this email is already a member
      const existingUser = await UserModel.findByEmail(email)
      if (existingUser) {
        const alreadyMember = await CompetitionModel.isMember(competitionId, existingUser.id)
        if (alreadyMember) {
          return res.status(400).json({ error: 'This person is already a member of the competition' })
        }
      }

      // Check if already invited
      const existingInvite = await CompetitionInviteModel.findByCompetitionAndEmail(
        competitionId,
        email
      )
      if (existingInvite && existingInvite.status === 'pending') {
        return res.status(400).json({ error: 'An invite has already been sent to this email' })
      }

      // If previously declined, delete old invite and allow re-invite
      if (existingInvite && existingInvite.status === 'declined') {
        await CompetitionInviteModel.deleteInvite(existingInvite.id)
      }

      // Create the invite
      const invite = await CompetitionInviteModel.create(
        competitionId,
        req.userId,
        email
      )

      // Get inviter's name
      const inviter = await UserModel.findById(req.userId)
      const inviterName = inviter?.displayName || 'Someone'

      // Send the email
      try {
        await sendInviteEmail(
          email,
          competition.name,
          inviterName,
          invite.inviteToken,
          competition.joinCode
        )
      } catch (emailError) {
        console.error('Failed to send invite email:', emailError)
        // Don't fail the request - invite is still created
      }

      res.status(201).json({
        message: `Invitation sent to ${email}`,
        invite: {
          id: invite.id,
          email: invite.email,
          status: invite.status,
          createdAt: invite.createdAt
        }
      })
    } catch (error: any) {
      if (error instanceof ZodError) return zodError(res, error)
      console.error('Invite error:', error)
      if (error.constraint === 'competition_invites_competition_id_email_key') {
        return res.status(400).json({ error: 'An invite has already been sent to this email' })
      }
      res.status(500).json({ error: 'Failed to send invitation' })
    }
  }

  // Get all invites for a competition
  static async getCompetitionInvites(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { id } = req.params
      const competitionId = parseInt(id)

      // Check user is a member
      const isMember = await CompetitionModel.isMember(competitionId, req.userId)
      if (!isMember) {
        return res.status(403).json({ error: 'Unauthorized' })
      }

      const invites = await CompetitionInviteModel.getByCompetition(competitionId)

      res.json({ invites })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invites' })
    }
  }

  // Accept an invite via token
  static async acceptInvite(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { token } = req.params

      const invite = await CompetitionInviteModel.findByToken(token)
      if (!invite) {
        return res.status(404).json({ error: 'Invite not found or expired' })
      }

      if (invite.status !== 'pending') {
        return res.status(400).json({ error: 'This invite has already been ' + invite.status })
      }

      // Check the logged-in user's email matches the invite
      const user = await UserModel.findById(req.userId)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Allow accepting even if emails don't match (user might have registered with different email)
      // But log it for tracking
      if (user.email !== invite.email) {
        console.log(`Invite accepted by different email: invite=${invite.email}, user=${user.email}`)
      }

      // Check if already a member
      const isMember = await CompetitionModel.isMember(invite.competitionId, req.userId)
      if (isMember) {
        // Mark invite as accepted anyway
        await CompetitionInviteModel.acceptInvite(invite.id)
        return res.json({
          message: 'You are already a member of this competition',
          competitionId: invite.competitionId
        })
      }

      // Add user to competition
      await CompetitionModel.addMember(invite.competitionId, req.userId)

      // Mark invite as accepted
      await CompetitionInviteModel.acceptInvite(invite.id)

      res.json({
        message: 'Successfully joined the competition!',
        competitionId: invite.competitionId
      })
    } catch (error) {
      console.error('Accept invite error:', error)
      res.status(500).json({ error: 'Failed to accept invitation' })
    }
  }

  // Get pending invites for the current user
  static async getMyInvites(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const user = await UserModel.findById(req.userId)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      let invites: any[] = []
      try {
        invites = await CompetitionInviteModel.getPendingByEmail(user.email)
      } catch (_) {
        // Invite table not yet created — return empty list
      }

      res.json({ invites })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invites' })
    }
  }

  // Decline an invite
  static async declineInvite(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { token } = req.params

      const invite = await CompetitionInviteModel.findByToken(token)
      if (!invite) {
        return res.status(404).json({ error: 'Invite not found' })
      }

      if (invite.status !== 'pending') {
        return res.status(400).json({ error: 'This invite has already been ' + invite.status })
      }

      await CompetitionInviteModel.declineInvite(invite.id)

      res.json({ message: 'Invite declined' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to decline invitation' })
    }
  }
}
