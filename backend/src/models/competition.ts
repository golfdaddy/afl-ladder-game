import { db } from '../db'
import { v4 as uuidv4 } from 'uuid'

export interface Competition {
  id: number
  createdBy: number
  seasonId: number
  name: string
  description: string | null
  isPublic: boolean
  joinCode: string
  createdAt: Date
  updatedAt: Date
}

export type CompetitionMemberRole = 'member' | 'league_admin'

export interface CompetitionMember {
  id: number
  competitionId: number
  userId: number
  role: CompetitionMemberRole
  joinedAt: Date
}

export class CompetitionModel {
  static async create(
    createdBy: number,
    seasonId: number,
    name: string,
    description: string | null = null,
    isPublic: boolean = false
  ): Promise<Competition> {
    const joinCode = uuidv4().substring(0, 8).toUpperCase()

    const result = await db.query(
      `INSERT INTO competitions (created_by, season_id, name, description, is_public, join_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, created_by as "createdBy", season_id as "seasonId", name, description,
                 is_public as "isPublic", join_code as "joinCode", created_at as "createdAt", updated_at as "updatedAt"`,
      [createdBy, seasonId, name, description, isPublic, joinCode]
    )

    return result.rows[0]
  }

  static async findById(id: number): Promise<Competition | null> {
    const result = await db.query(
      `SELECT id, created_by as "createdBy", season_id as "seasonId", name, description,
              is_public as "isPublic", join_code as "joinCode", created_at as "createdAt", updated_at as "updatedAt"
       FROM competitions WHERE id = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  static async findByJoinCode(joinCode: string): Promise<Competition | null> {
    const result = await db.query(
      `SELECT id, created_by as "createdBy", season_id as "seasonId", name, description,
              is_public as "isPublic", join_code as "joinCode", created_at as "createdAt", updated_at as "updatedAt"
       FROM competitions WHERE join_code = $1`,
      [joinCode]
    )
    return result.rows[0] || null
  }

  static async getUserCompetitions(userId: number, seasonId?: number): Promise<any[]> {
    let query = `
      SELECT
        c.id, c.created_by as "createdBy", c.season_id as "seasonId", c.name, c.description,
        c.is_public as "isPublic", c.join_code as "joinCode",
        c.created_at as "createdAt", c.updated_at as "updatedAt",
        -- Member count
        (SELECT COUNT(*) FROM competition_members WHERE competition_id = c.id)::int AS "memberCount",
        -- User's rank in this competition via LEFT JOIN with scores
        ranked.user_rank AS "userRank",
        -- User's score
        s.total_points AS "userScore",
        -- Whether the current user has submitted a prediction
        EXISTS(
          SELECT 1 FROM predictions
          WHERE user_id = $1 AND season_id = c.season_id
        ) AS "userHasSubmitted"
      FROM competitions c
      JOIN competition_members cm ON c.id = cm.competition_id
      -- Join user's score for this competition
      LEFT JOIN scores s ON s.competition_id = c.id AND s.user_id = $1 AND s.season_id = c.season_id
      -- Join rank subquery
      LEFT JOIN LATERAL (
        SELECT RANK() OVER (ORDER BY total_points ASC)::int AS user_rank
        FROM scores
        WHERE competition_id = c.id AND season_id = c.season_id AND user_id = $1
        LIMIT 1
      ) ranked ON true
      WHERE cm.user_id = $1`

    const params: any[] = [userId]

    if (seasonId) {
      query += ` AND c.season_id = $2`
      params.push(seasonId)
    }

    query += ` ORDER BY c.created_at DESC`

    const result = await db.query(query, params)
    return result.rows
  }

  static async addMember(
    competitionId: number,
    userId: number,
    role: CompetitionMemberRole = 'member'
  ): Promise<CompetitionMember> {
    const result = await db.query(
      `INSERT INTO competition_members (competition_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, competition_id as "competitionId", user_id as "userId", role, joined_at as "joinedAt"`,
      [competitionId, userId, role]
    )
    return result.rows[0]
  }

  static async getMembers(competitionId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT u.id, u.email, u.display_name as "displayName",
              cm.role as "memberRole",
              CASE WHEN p.id IS NOT NULL THEN true ELSE false END as "hasSubmitted",
              p.submitted_at as "submittedAt",
              p.updated_at as "predictionUpdatedAt"
       FROM competition_members cm
       JOIN users u ON cm.user_id = u.id
       JOIN competitions c ON cm.competition_id = c.id
       LEFT JOIN predictions p ON p.user_id = u.id AND p.season_id = c.season_id
       WHERE cm.competition_id = $1
       ORDER BY
         CASE cm.role WHEN 'league_admin' THEN 0 ELSE 1 END,
         cm.joined_at ASC`,
      [competitionId]
    )
    return result.rows
  }

  static async getMemberRole(
    competitionId: number,
    userId: number
  ): Promise<CompetitionMemberRole | null> {
    const result = await db.query(
      `SELECT role FROM competition_members WHERE competition_id = $1 AND user_id = $2`,
      [competitionId, userId]
    )
    return result.rows[0]?.role || null
  }

  static async isMember(competitionId: number, userId: number): Promise<boolean> {
    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1 FROM competition_members
         WHERE competition_id = $1 AND user_id = $2
       ) as exists`,
      [competitionId, userId]
    )
    return result.rows[0]?.exists || false
  }

  static async getPublicCompetitions(seasonId: number, limit: number = 20, offset: number = 0): Promise<Competition[]> {
    const result = await db.query(
      `SELECT id, created_by as "createdBy", season_id as "seasonId", name, description,
              is_public as "isPublic", join_code as "joinCode", created_at as "createdAt", updated_at as "updatedAt"
       FROM competitions
       WHERE is_public = true AND season_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [seasonId, limit, offset]
    )
    return result.rows
  }
}
