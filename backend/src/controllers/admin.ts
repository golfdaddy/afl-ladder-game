import { Request, Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { AFLLadderModel, AFLTeam } from '../models/aflLadder'
import { ScoreModel } from '../models/score'
import { SquiggleService } from '../services/squiggle'
import { EmailGroupModel } from '../models/emailGroup'
import { UserModel, UserRole } from '../models/user'
import { db } from '../db'
import { SeasonModel } from '../models/season'
import { EmailTemplateModel } from '../models/emailTemplate'
import { renderTemplate, extractTemplateTokens } from '../utils/templateRenderer'
import { sendEmail } from '../services/email'

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

  /** Admin: update season cutoff date (YYYY-MM-DD) */
  static async setSeasonCutoff(req: AuthRequest, res: Response) {
    try {
      const seasonId = Number(req.params.seasonId)
      const cutoffDate = String(req.body?.cutoffDate || '')

      if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return res.status(400).json({ error: 'Invalid seasonId' })
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
        return res.status(400).json({ error: 'cutoffDate must be YYYY-MM-DD' })
      }

      const updated = await SeasonModel.updateCutoffDate(seasonId, cutoffDate)
      if (!updated) {
        return res.status(404).json({ error: 'Season not found' })
      }

      res.json({ message: 'Season cutoff updated', season: updated })
    } catch (error) {
      console.error('Set season cutoff error:', error)
      res.status(500).json({ error: 'Failed to update season cutoff' })
    }
  }

  /** Admin: list reusable email templates */
  static async listEmailTemplates(_req: Request, res: Response) {
    const templates = await EmailTemplateModel.list()
    res.json({
      templates: templates.map((t) => ({
        ...t,
        tokens: extractTemplateTokens(`${t.subjectTemplate}\n${t.htmlTemplate}`),
      })),
    })
  }

  /** Admin: create an email template */
  static async createEmailTemplate(req: AuthRequest, res: Response) {
    const name = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim() || null
    const subjectTemplate = String(req.body?.subjectTemplate || '').trim()
    const htmlTemplate = String(req.body?.htmlTemplate || '').trim()

    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    if (!name) return res.status(400).json({ error: 'Template name is required' })
    if (!subjectTemplate) return res.status(400).json({ error: 'Subject template is required' })
    if (!htmlTemplate) return res.status(400).json({ error: 'HTML template is required' })

    try {
      const template = await EmailTemplateModel.create({
        name,
        description,
        subjectTemplate,
        htmlTemplate,
        createdBy: req.userId,
      })
      res.status(201).json({
        template: {
          ...template,
          tokens: extractTemplateTokens(`${template.subjectTemplate}\n${template.htmlTemplate}`),
        },
      })
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(400).json({ error: 'A template with this name already exists' })
      }
      throw error
    }
  }

  /** Admin: update an email template */
  static async updateEmailTemplate(req: AuthRequest, res: Response) {
    const templateId = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim() || null
    const subjectTemplate = String(req.body?.subjectTemplate || '').trim()
    const htmlTemplate = String(req.body?.htmlTemplate || '').trim()

    if (!Number.isFinite(templateId)) return res.status(400).json({ error: 'Invalid template id' })
    if (!name) return res.status(400).json({ error: 'Template name is required' })
    if (!subjectTemplate) return res.status(400).json({ error: 'Subject template is required' })
    if (!htmlTemplate) return res.status(400).json({ error: 'HTML template is required' })

    try {
      const template = await EmailTemplateModel.update(templateId, {
        name,
        description,
        subjectTemplate,
        htmlTemplate,
      })
      if (!template) return res.status(404).json({ error: 'Template not found' })

      res.json({
        template: {
          ...template,
          tokens: extractTemplateTokens(`${template.subjectTemplate}\n${template.htmlTemplate}`),
        },
      })
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(400).json({ error: 'A template with this name already exists' })
      }
      throw error
    }
  }

  /** Admin: delete an email template */
  static async deleteEmailTemplate(req: AuthRequest, res: Response) {
    const templateId = Number(req.params.id)
    if (!Number.isFinite(templateId)) return res.status(400).json({ error: 'Invalid template id' })

    await EmailTemplateModel.delete(templateId)
    res.json({ message: 'Template deleted' })
  }

  /** Admin: preview rendered template with sample/custom data */
  static async previewEmailTemplate(req: AuthRequest, res: Response) {
    const subjectTemplate = String(req.body?.subjectTemplate || '').trim()
    const htmlTemplate = String(req.body?.htmlTemplate || '').trim()
    const sampleData = req.body?.sampleData && typeof req.body.sampleData === 'object' && !Array.isArray(req.body.sampleData)
      ? req.body.sampleData
      : {}

    if (!subjectTemplate || !htmlTemplate) {
      return res.status(400).json({ error: 'subjectTemplate and htmlTemplate are required' })
    }

    const baseSample = {
      displayName: 'Matt',
      email: 'matt@example.com',
      seasonYear: new Date().getFullYear(),
      roundNo: 1,
      competitionCount: 3,
      predictionCount: 1,
      bestScore: 66,
      ...sampleData,
    }

    res.json({
      preview: {
        subject: renderTemplate(subjectTemplate, baseSample),
        html: renderTemplate(htmlTemplate, baseSample),
      },
      tokens: extractTemplateTokens(`${subjectTemplate}\n${htmlTemplate}`),
    })
  }

  /** Admin: send a templated campaign to all users or selected email groups */
  static async sendEmailTemplate(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

    const templateId = Number(req.params.id)
    if (!Number.isFinite(templateId)) return res.status(400).json({ error: 'Invalid template id' })

    const testEmail = String(req.body?.testEmail || '').trim()
    const roundNoRaw = req.body?.roundNo
    const roundNo = roundNoRaw === undefined || roundNoRaw === null || roundNoRaw === ''
      ? null
      : Number(roundNoRaw)
    const seasonIdRaw = req.body?.seasonId
    const seasonIdInput = seasonIdRaw === undefined || seasonIdRaw === null || seasonIdRaw === ''
      ? null
      : Number(seasonIdRaw)
    const groupIdsRaw = Array.isArray(req.body?.groupIds) ? req.body.groupIds : []
    const groupIds = groupIdsRaw
      .map((g: unknown) => Number(g))
      .filter((g: number) => Number.isInteger(g) && g > 0)
    const dryRun = req.body?.dryRun === true
    const customData = req.body?.customData && typeof req.body.customData === 'object' && !Array.isArray(req.body.customData)
      ? req.body.customData
      : {}

    if (roundNo !== null && (!Number.isFinite(roundNo) || roundNo <= 0)) {
      return res.status(400).json({ error: 'roundNo must be a positive number' })
    }
    if (seasonIdInput !== null && (!Number.isFinite(seasonIdInput) || seasonIdInput <= 0)) {
      return res.status(400).json({ error: 'seasonId must be a positive number' })
    }

    const template = await EmailTemplateModel.findById(templateId)
    if (!template) return res.status(404).json({ error: 'Template not found' })

    let effectiveSeasonId = seasonIdInput
    let seasonYear = new Date().getFullYear()

    if (effectiveSeasonId) {
      const season = await SeasonModel.getSeasonById(effectiveSeasonId)
      if (season) seasonYear = season.year
      else effectiveSeasonId = null
    } else {
      const current = await SeasonModel.getCurrentSeason()
      if (current) {
        effectiveSeasonId = current.id
        seasonYear = current.year
      }
    }

    let recipients: Array<{ id: number | null; email: string; displayName: string }> = []

    if (testEmail) {
      recipients = [{ id: null, email: testEmail, displayName: 'Test User' }]
    } else {
      let userIds: number[] = []
      if (groupIds.length > 0) {
        const idSet = new Set<number>()
        for (const groupId of groupIds) {
          const ids = await EmailGroupModel.getUsersInGroup(groupId)
          ids.forEach((id) => idSet.add(id))
        }
        userIds = Array.from(idSet)
        if (userIds.length === 0) {
          return res.status(400).json({ error: 'Selected groups contain no users' })
        }
      }

      if (userIds.length > 0) {
        const usersResult = await db.query(
          `SELECT id, email, display_name as "displayName"
           FROM users
           WHERE id = ANY($1::int[])
           ORDER BY id ASC`,
          [userIds]
        )
        recipients = usersResult.rows
      } else {
        const usersResult = await db.query(
          `SELECT id, email, display_name as "displayName"
           FROM users
           ORDER BY id ASC`
        )
        recipients = usersResult.rows
      }
    }

    recipients = recipients.filter((r) => !!r.email)
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients found' })
    }

    const statsByUserId = new Map<number, { competitionCount: number; predictionCount: number; bestScore: number | null }>()
    const recipientsWithUserIds = recipients.filter((r): r is { id: number; email: string; displayName: string } => r.id !== null)

    if (effectiveSeasonId && recipientsWithUserIds.length > 0) {
      const ids = recipientsWithUserIds.map((r) => r.id)
      const statsResult = await db.query(
        `SELECT u.id,
                COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN cm.competition_id END)::int as "competitionCount",
                COUNT(DISTINCT p.id)::int as "predictionCount",
                MIN(s.total_points)::int as "bestScore"
         FROM users u
         LEFT JOIN competition_members cm ON cm.user_id = u.id
         LEFT JOIN competitions c ON c.id = cm.competition_id AND c.season_id = $1
         LEFT JOIN predictions p ON p.user_id = u.id AND p.season_id = $1
         LEFT JOIN scores s ON s.user_id = u.id AND s.season_id = $1
         WHERE u.id = ANY($2::int[])
         GROUP BY u.id`,
        [effectiveSeasonId, ids]
      )

      for (const row of statsResult.rows) {
        statsByUserId.set(Number(row.id), {
          competitionCount: Number(row.competitionCount) || 0,
          predictionCount: Number(row.predictionCount) || 0,
          bestScore: row.bestScore === null || row.bestScore === undefined ? null : Number(row.bestScore),
        })
      }
    }

    const rendered = recipients.map((recipient) => {
      const stats = recipient.id !== null
        ? statsByUserId.get(recipient.id) || { competitionCount: 0, predictionCount: 0, bestScore: null }
        : { competitionCount: 0, predictionCount: 0, bestScore: null }

      const context = {
        displayName: recipient.displayName,
        email: recipient.email,
        userId: recipient.id,
        seasonId: effectiveSeasonId,
        seasonYear,
        roundNo,
        competitionCount: stats.competitionCount,
        predictionCount: stats.predictionCount,
        bestScore: stats.bestScore,
        ...customData,
      }

      return {
        to: recipient.email,
        subject: renderTemplate(template.subjectTemplate, context),
        html: renderTemplate(template.htmlTemplate, context),
      }
    })

    if (dryRun) {
      return res.json({
        message: 'Dry run only — no emails sent',
        recipientCount: rendered.length,
        preview: rendered.slice(0, 3),
        tokens: extractTemplateTokens(`${template.subjectTemplate}\n${template.htmlTemplate}`),
      })
    }

    const failures: Array<{ to: string; error: string }> = []
    let sentCount = 0

    for (const item of rendered) {
      try {
        await sendEmail({
          to: item.to,
          subject: item.subject,
          html: item.html,
        })
        sentCount += 1
      } catch (error: any) {
        failures.push({
          to: item.to,
          error: error?.message || 'Unknown send error',
        })
      }
    }

    await EmailTemplateModel.logCampaignSend({
      templateId: template.id,
      sentBy: req.userId,
      seasonId: effectiveSeasonId,
      roundNo,
      recipientCount: sentCount,
    })

    res.json({
      message: testEmail
        ? `Test email sent to ${testEmail}`
        : `Campaign completed. Sent ${sentCount}/${rendered.length} emails.`,
      recipientCount: rendered.length,
      sentCount,
      failedCount: failures.length,
      failures: failures.slice(0, 20),
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

  /** Export all submitted ladder predictions as CSV for safe-keeping */
  static async exportPredictions(req: AuthRequest, res: Response) {
    try {
      const seasonId = parseInt((req.query.seasonId as string) || '1')

      // Get all 18 team names in position order (1–18) by sampling any prediction
      const teamsResult = await db.query(
        `SELECT DISTINCT pt.team_name as "teamName"
         FROM prediction_teams pt
         JOIN predictions p ON pt.prediction_id = p.id
         WHERE p.season_id = $1
         LIMIT 18`,
        [seasonId]
      )

      // Get every submitted prediction for the season
      const result = await db.query(
        `SELECT u.id as "userId", u.display_name as "displayName", u.email,
                p.id as "predictionId", p.submitted_at as "submittedAt", p.total_score as "totalScore",
                pt.position, pt.team_name as "teamName"
         FROM predictions p
         JOIN users u ON p.user_id = u.id
         JOIN prediction_teams pt ON pt.prediction_id = p.id
         WHERE p.season_id = $1 AND p.submitted_at IS NOT NULL
         ORDER BY u.display_name, pt.position`,
        [seasonId]
      )

      // Group by user
      const users: Record<number, any> = {}
      for (const row of result.rows) {
        if (!users[row.userId]) {
          users[row.userId] = {
            userId: row.userId,
            displayName: row.displayName,
            email: row.email,
            submittedAt: row.submittedAt,
            totalScore: row.totalScore,
            ladder: [] as string[],
          }
        }
        users[row.userId].ladder[row.position - 1] = row.teamName
      }

      const format = (req.query.format as string) || 'json'

      if (format === 'csv') {
        // Build CSV: displayName, email, submittedAt, totalScore, pos1..pos18
        const positions = Array.from({ length: 18 }, (_, i) => `pos${i + 1}`)
        const header = ['displayName', 'email', 'submittedAt', 'totalScore', ...positions].join(',')
        const rows = Object.values(users).map((u: any) => {
          const base = [
            `"${u.displayName}"`,
            `"${u.email}"`,
            `"${u.submittedAt ? new Date(u.submittedAt).toISOString() : ''}"`,
            u.totalScore ?? '',
          ]
          const teams = positions.map((_, i) => `"${u.ladder[i] || ''}"`)
          return [...base, ...teams].join(',')
        })
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename="predictions-season${seasonId}.csv"`)
        return res.send([header, ...rows].join('\n'))
      }

      // Default: JSON
      res.json({ season: seasonId, count: Object.keys(users).length, predictions: Object.values(users) })
    } catch (error) {
      console.error('Export predictions error:', error)
      res.status(500).json({ error: 'Failed to export predictions' })
    }
  }
}
