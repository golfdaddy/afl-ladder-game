import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'

export type FantasyCompetitionMemberRole = 'member' | 'league_admin'

export interface FantasyCompetition {
  id: number
  createdBy: number
  seasonId: number
  name: string
  description: string | null
  isPublic: boolean
  joinCode: string
  startRound: number
  endRound: number
  createdAt: Date
  updatedAt: Date
}

export class FantasyCompetitionModel {
  static async create(
    createdBy: number,
    seasonId: number,
    name: string,
    description: string | null,
    isPublic: boolean,
    startRound: number,
    endRound: number
  ): Promise<FantasyCompetition> {
    const joinCode = uuidv4().substring(0, 8).toUpperCase()
    const result = await db.query(
      `INSERT INTO fantasy_competitions
         (created_by, season_id, name, description, is_public, join_code, start_round, end_round, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, created_by as "createdBy", season_id as "seasonId", name, description,
                 is_public as "isPublic", join_code as "joinCode",
                 start_round as "startRound", end_round as "endRound",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [createdBy, seasonId, name, description, isPublic, joinCode, startRound, endRound]
    )
    return result.rows[0]
  }

  static async findById(id: number): Promise<FantasyCompetition | null> {
    const result = await db.query(
      `SELECT id, created_by as "createdBy", season_id as "seasonId", name, description,
              is_public as "isPublic", join_code as "joinCode",
              start_round as "startRound", end_round as "endRound",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM fantasy_competitions
       WHERE id = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  static async findByJoinCode(joinCode: string): Promise<FantasyCompetition | null> {
    const result = await db.query(
      `SELECT id, created_by as "createdBy", season_id as "seasonId", name, description,
              is_public as "isPublic", join_code as "joinCode",
              start_round as "startRound", end_round as "endRound",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM fantasy_competitions
       WHERE join_code = $1`,
      [joinCode]
    )
    return result.rows[0] || null
  }

  static async isMember(competitionId: number, userId: number): Promise<boolean> {
    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1 FROM fantasy_competition_members
         WHERE competition_id = $1 AND user_id = $2
       ) as exists`,
      [competitionId, userId]
    )
    return result.rows[0]?.exists || false
  }

  static async addMember(
    competitionId: number,
    userId: number,
    role: FantasyCompetitionMemberRole = 'member'
  ): Promise<void> {
    await db.query(
      `INSERT INTO fantasy_competition_members (competition_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (competition_id, user_id) DO NOTHING`,
      [competitionId, userId, role]
    )
  }

  static async getMemberRole(competitionId: number, userId: number): Promise<FantasyCompetitionMemberRole | null> {
    const result = await db.query(
      `SELECT role
       FROM fantasy_competition_members
       WHERE competition_id = $1 AND user_id = $2`,
      [competitionId, userId]
    )
    return result.rows[0]?.role || null
  }

  static async getMembers(competitionId: number): Promise<Array<{
    id: number
    email: string
    displayName: string
    memberRole: FantasyCompetitionMemberRole
    joinedAt: Date
  }>> {
    const result = await db.query(
      `SELECT u.id, u.email, u.display_name as "displayName",
              m.role as "memberRole", m.joined_at as "joinedAt"
       FROM fantasy_competition_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.competition_id = $1
       ORDER BY CASE m.role WHEN 'league_admin' THEN 0 ELSE 1 END, m.joined_at ASC`,
      [competitionId]
    )
    return result.rows
  }

  static async getUserCompetitions(userId: number): Promise<Array<FantasyCompetition & {
    memberCount: number
  }>> {
    const result = await db.query(
      `SELECT c.id, c.created_by as "createdBy", c.season_id as "seasonId",
              c.name, c.description, c.is_public as "isPublic", c.join_code as "joinCode",
              c.start_round as "startRound", c.end_round as "endRound",
              c.created_at as "createdAt", c.updated_at as "updatedAt",
              (SELECT COUNT(*)::int FROM fantasy_competition_members m2 WHERE m2.competition_id = c.id) as "memberCount"
       FROM fantasy_competitions c
       JOIN fantasy_competition_members m ON m.competition_id = c.id
       WHERE m.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    )
    return result.rows
  }

  static async getPublicCompetitions(
    seasonId: number,
    limit: number = 20,
    offset: number = 0
  ): Promise<FantasyCompetition[]> {
    const result = await db.query(
      `SELECT id, created_by as "createdBy", season_id as "seasonId", name, description,
              is_public as "isPublic", join_code as "joinCode",
              start_round as "startRound", end_round as "endRound",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM fantasy_competitions
       WHERE season_id = $1 AND is_public = true
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [seasonId, limit, offset]
    )
    return result.rows
  }

  static async listByRound(roundId: number): Promise<FantasyCompetition[]> {
    const result = await db.query(
      `SELECT c.id, c.created_by as "createdBy", c.season_id as "seasonId", c.name, c.description,
              c.is_public as "isPublic", c.join_code as "joinCode",
              c.start_round as "startRound", c.end_round as "endRound",
              c.created_at as "createdAt", c.updated_at as "updatedAt"
       FROM fantasy_competitions c
       JOIN fantasy_rounds r ON r.season_id = c.season_id
       WHERE r.id = $1
         AND r.round_no BETWEEN c.start_round AND c.end_round`,
      [roundId]
    )
    return result.rows
  }
}
