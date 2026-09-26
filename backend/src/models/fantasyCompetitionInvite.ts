import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'

export type FantasyInviteStatus = 'pending' | 'accepted' | 'declined'

export interface FantasyCompetitionInvite {
  id: number
  competitionId: number
  invitedBy: number
  email: string
  inviteToken: string
  status: FantasyInviteStatus
  createdAt: Date
  acceptedAt: Date | null
}

export class FantasyCompetitionInviteModel {
  static async create(
    competitionId: number,
    invitedBy: number,
    email: string
  ): Promise<FantasyCompetitionInvite> {
    const inviteToken = uuidv4()
    const result = await db.query(
      `INSERT INTO fantasy_competition_invites
         (competition_id, invited_by, email, invite_token, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING id, competition_id as "competitionId", invited_by as "invitedBy",
                 email, invite_token as "inviteToken", status,
                 created_at as "createdAt", accepted_at as "acceptedAt"`,
      [competitionId, invitedBy, email, inviteToken]
    )
    return result.rows[0]
  }

  static async findByToken(token: string): Promise<FantasyCompetitionInvite | null> {
    const result = await db.query(
      `SELECT id, competition_id as "competitionId", invited_by as "invitedBy",
              email, invite_token as "inviteToken", status,
              created_at as "createdAt", accepted_at as "acceptedAt"
       FROM fantasy_competition_invites
       WHERE invite_token = $1`,
      [token]
    )
    return result.rows[0] || null
  }

  static async findByCompetitionAndEmail(competitionId: number, email: string): Promise<FantasyCompetitionInvite | null> {
    const result = await db.query(
      `SELECT id, competition_id as "competitionId", invited_by as "invitedBy",
              email, invite_token as "inviteToken", status,
              created_at as "createdAt", accepted_at as "acceptedAt"
       FROM fantasy_competition_invites
       WHERE competition_id = $1 AND email = $2`,
      [competitionId, email]
    )
    return result.rows[0] || null
  }

  static async getByCompetition(competitionId: number): Promise<Array<FantasyCompetitionInvite & { invitedByName: string }>> {
    const result = await db.query(
      `SELECT i.id, i.competition_id as "competitionId", i.invited_by as "invitedBy",
              i.email, i.invite_token as "inviteToken", i.status,
              i.created_at as "createdAt", i.accepted_at as "acceptedAt",
              u.display_name as "invitedByName"
       FROM fantasy_competition_invites i
       JOIN users u ON i.invited_by = u.id
       WHERE i.competition_id = $1
       ORDER BY i.created_at DESC`,
      [competitionId]
    )
    return result.rows
  }

  static async getPendingByEmail(email: string): Promise<any[]> {
    const result = await db.query(
      `SELECT i.id, i.competition_id as "competitionId", i.invite_token as "inviteToken",
              i.created_at as "createdAt",
              c.name as "competitionName", c.description as "competitionDescription",
              u.display_name as "invitedByName"
       FROM fantasy_competition_invites i
       JOIN fantasy_competitions c ON i.competition_id = c.id
       JOIN users u ON i.invited_by = u.id
       WHERE i.email = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [email]
    )
    return result.rows
  }

  static async acceptInvite(id: number): Promise<void> {
    await db.query(
      `UPDATE fantasy_competition_invites
       SET status = 'accepted', accepted_at = NOW()
       WHERE id = $1`,
      [id]
    )
  }

  static async declineInvite(id: number): Promise<void> {
    await db.query(
      `UPDATE fantasy_competition_invites
       SET status = 'declined'
       WHERE id = $1`,
      [id]
    )
  }

  static async deleteInvite(id: number): Promise<void> {
    await db.query(
      `DELETE FROM fantasy_competition_invites WHERE id = $1`,
      [id]
    )
  }
}
