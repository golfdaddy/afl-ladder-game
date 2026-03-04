import { Request, Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { AFLLadderModel, AFLTeam } from '../models/aflLadder'
import { ScoreModel } from '../models/score'
import { SquiggleService } from '../services/squiggle'
import { EmailGroupModel } from '../models/emailGroup'
import { UserModel, UserRole } from '../models/user'

export class AdminController {
  /** Manual ladder upload (18 teams with full stats) */
  static async uploadAFLLadder(req: AuthRequest, res: Response) {
    try {
      const { userId } = req
      if (userId === undefined) return res.status(401).json({ error: 'Unauthorized' })

      const { seasonId, teams, round, source } = req.body

      if (!seasonId || !Array.isArray(teams) || teams.length !== 18) {
        return res.status(400).json({ error: 'Invalid ladder data. Must have 18 teams.' })
      }

      const isValid = teams.every(
        (t: any) =>
          typeof t.position === 'number' &&
          t.position >= 1 &&
          t.position <= 18 &&
          typeof t.teamName === 'string' &&
          typeof t.wins === 'number' &&
          typeof t.losses === 'number' &&
          typeof t.pointsFor === 'number' &&
          typeof t.pointsAgainst === 'number' &&
          typeof t.percentage === 'number'
      )

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid team data format' })
      }

      const ladder = await AFLLadderModel.uploadLadder(seasonId, teams, round || null, source || 'manual')
      await ScoreModel.calculateAndUpdateScores(seasonId)

      res.json({ message: 'AFL ladder uploaded and scores updated', ladder })
    } catch (error) {
      console.error('Admin ladder upload error:', error)
      res.status(500).json({ error: 'Failed to upload ladder' })
    }
  }

  /** Auto-sync ladder from Squiggle API */
  static async syncFromSquiggle(req: AuthRequest, res: Response) {
    try {
      const { userId } = req
      if (userId === undefined) return res.status(401).json({ error: 'Unauthorized' })

      const { seasonId, year } = req.body

      if (!seasonId) {
        return res.status(400).json({ error: 'seasonId is required' })
      }

      const aflYear = year || new Date().getFullYear()

      let teams = await SquiggleService.fetchStandings(aflYear)

      // If 2026 has no data yet, fall back to previous year for testing
      if (!teams && aflYear === 2026) {
        console.log('[Admin] No 2026 data yet — trying 2025 as fallback')
        teams = await SquiggleService.fetchStandings(2025)
        if (teams) {
          console.log('[Admin] Using 2025 standings as placeholder for 2026 season')
        }
      }

      if (!teams || teams.length === 0) {
        return res.status(404).json({
          error: `No standings data available from Squiggle for ${aflYear}. The AFL season may not have started yet.`
        })
      }

      // Pad to 18 if needed (e.g., mid-round partial data)
      const ladder = await AFLLadderModel.uploadLadder(
        seasonId,
        teams as AFLTeam[],
        null,
        `squiggle-${aflYear}`
      )

      await ScoreModel.calculateAndUpdateScores(seasonId)

      res.json({
        message: `Synced ${teams.length} teams from Squiggle (${aflYear})`,
        source: `squiggle-${aflYear}`,
        teamsCount: teams.length,
        ladder,
      })
    } catch (error: any) {
      console.error('Squiggle sync error:', error)
      res.status(500).json({ error: error.message || 'Failed to sync from Squiggle API' })
    }
  }

  /** Get latest ladder for a season (public — no auth required) */
  static async getLatestLadder(req: Request, res: Response) {
    try {
      const { seasonId } = req.params
      const ladder = await AFLLadderModel.getLatestLadder(parseInt(seasonId))

      if (!ladder) {
        return res.status(404).json({ error: 'No ladder data found for this season' })
      }

      res.json({ ladder })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch ladder' })
    }
  }

  /** Admin: list all users with stats */
  static async listUsers(_req: Request, res: Response) {
    try {
      const users = await UserModel.listAll()
      res.json({ users })
    } catch (error) {
      console.error('List users error:', error)
      res.status(500).json({ error: 'Failed to list users' })
    }
  }

  /** Admin: update a user's role by ID */
  static async setUserRole(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params
      const { role } = req.body
      const targetId = parseInt(id)

      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin".' })
      }

      // Prevent admins from demoting themselves (avoid accidental lockout)
      if (req.userId === targetId && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot change your own admin role.' })
      }

      const updated = await UserModel.setRole(targetId, role as UserRole)
      if (!updated) {
        return res.status(404).json({ error: 'User not found' })
      }

      res.json({ user: updated })
    } catch (error) {
      console.error('Set user role error:', error)
      res.status(500).json({ error: 'Failed to update user role' })
    }
  }

  /**
   * Promote a user to admin by email.
   * Can be called with just X-Admin-Secret (no JWT needed) for first-time setup.
   */
  static async promoteByEmail(req: Request, res: Response) {
    try {
      const { email, role } = req.body

      if (!email) {
        return res.status(400).json({ error: 'email is required' })
      }

      const targetRole: UserRole = role === 'user' ? 'user' : 'admin'
      const updated = await UserModel.setRoleByEmail(email, targetRole)

      if (!updated) {
        return res.status(404).json({ error: `No user found with email: ${email}` })
      }

      res.json({ message: `User ${email} is now ${targetRole}`, user: updated })
    } catch (error) {
      console.error('Promote by email error:', error)
      res.status(500).json({ error: 'Failed to promote user' })
    }
  }

  static async health(_req: Request, res: Response) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    })
  }

  // ── Email Groups ──────────────────────────────────────────────────────────

  /** List all email groups */
  static async listEmailGroups(_req: Request, res: Response) {
    try {
      const groups = await EmailGroupModel.listGroups()
      res.json({ groups })
    } catch (error) {
      res.status(500).json({ error: 'Failed to list email groups' })
    }
  }

  /**
   * Get the email group IDs for a specific user.
   * Returns { groupIds: number[] }
   */
  static async getUserEmailGroups(req: Request, res: Response) {
    try {
      const userId = parseInt((req as any).params.userId)
      const groupIds = await EmailGroupModel.getUserGroupIds(userId)
      res.json({ groupIds })
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user email groups' })
    }
  }

  /** Add a user to an email group */
  static async addUserToEmailGroup(req: Request, res: Response) {
    try {
      const userId  = parseInt((req as any).params.userId)
      const groupId = parseInt((req as any).params.groupId)
      await EmailGroupModel.addUserToGroup(userId, groupId)
      res.json({ message: 'User added to group' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to add user to group' })
    }
  }

  /** Remove a user from an email group */
  static async removeUserFromEmailGroup(req: Request, res: Response) {
    try {
      const userId  = parseInt((req as any).params.userId)
      const groupId = parseInt((req as any).params.groupId)
      await EmailGroupModel.removeUserFromGroup(userId, groupId)
      res.json({ message: 'User removed from group' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove user from group' })
    }
  }

  /**
   * List all users with their group memberships in one call.
   * Returns { users: AdminUser[], groups: EmailGroup[], memberships: Record<userId, groupId[]> }
   */
  static async listUsersWithGroups(_req: Request, res: Response) {
    try {
      const users  = await UserModel.listAll()
      const groups = await EmailGroupModel.listGroups()

      // Build a membership map: userId → groupIds[]
      const memberships: Record<number, number[]> = {}
      for (const u of users) {
        memberships[u.id] = await EmailGroupModel.getUserGroupIds(u.id)
      }

      res.json({ users, groups, memberships })
    } catch (error) {
      console.error('listUsersWithGroups error:', error)
      res.status(500).json({ error: 'Failed to load users and groups' })
    }
  }
}
