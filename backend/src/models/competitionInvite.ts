import { db } from '../db'
import { v4 as uuidv4 } from 'uuid'

export interface CompetitionInvite {
  id: number
  competitionId: number
  invitedBy: number
  email: string
  inviteToken: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
  acceptedAt: Date | null
}

export class CompetitionInviteModel {
  static async create(
    competitionId: number,
    invitedBy: number,
    email: string
  ): Promise<CompetitionInvite> {
    const inviteToken = uuidv4()

    const result = await db.query(
      `INSERT INTO competition_invites (competition_id, invited_by, email, invite_token, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING id, competition_id as "competitionId", invited_by as "invitedBy", email,
                 invite_token as "inviteToken", status, created_at as "createdAt", accepted_at as "acceptedAt"`,
      [competitionId, invitedBy, email, inviteToken]
    )

    return result.rows[0]
  }

  static async findByToken(token: string): Promise<CompetitionInvite | null> {
    const result = await db.query(
      `SELECT id, competition_id as "competitionId", invited_by as "invitedBy", email,
              invite_token as "inviteToken", status, created_at as "createdAt", accepted_at as "acceptedAt"
       FROM competition_invites WHERE invite_token = $1`,
      [token]
    )
    return result.rows[0] || null
  }

  static async findByCompetitionAndEmail(
    competitionId: number,
    email: string
  ): Promise<CompetitionInvite | null> {
    const result = await db.query(
      `SELECT id, competition_id as "competitionId", invited_by as "invitedBy", email,
              invite_token as "inviteToken", status, created_at as "createdAt", accepted_at as "acceptedAt"
       FROM competition_invites WHERE competition_id = $1 AND email = $2`,
      [competitionId, email]
    )
    return result.rows[0] || null
  }

  static async getByCompetition(competitionId: number): Promise<CompetitionInvite[]> {
    const result = await db.query(
      `SELECT ci.id, ci.competition_id as "competitionId", ci.invited_by as "invitedBy", ci.email,
              ci.invite_token as "inviteToken", ci.status, ci.created_at as "createdAt",
              ci.accepted_at as "acceptedAt",
              u.display_name as "invitedByName"
       FROM competition_invites ci
       JOIN users u ON ci.invited_by = u.id
       WHERE ci.competition_id = $1
       ORDER BY ci.created_at DESC`,
      [competitionId]
    )
    return result.rows
  }

  static async getPendingByEmail(email: string): Promise<any[]> {
    const result = await db.query(
      `SELECT ci.id, ci.competition_id as "competitionId", ci.invite_token as "inviteToken",
              ci.created_at as "createdAt",
              c.name as "competitionName", c.description as "competitionDescription",
              u.display_name as "invitedByName"
       FROM competition_invites ci
       JOIN competitions c ON ci.competition_id = c.id
       JOIN users u ON ci.invited_by = u.id
       WHERE ci.email = $1 AND ci.status = 'pending'
       ORDER BY ci.created_at DESC`,
      [email]
    )
    return result.rows
  }

  static async acceptInvite(id: number): Promise<void> {
    await db.query(
      `UPDATE competition_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [id]
    )
  }

  static async declineInvite(id: number): Promise<void> {
    await db.query(
      `UPDATE competition_invites SET status = 'declined' WHERE id = $1`,
      [id]
    )
  }

  static async deleteInvite(id: number): Promise<void> {
    await db.query(
      `DELETE FROM competition_invites WHERE id = $1`,
      [id]
    )
  }
}
