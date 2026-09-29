import { db } from '../db'
import { SevensModel } from './sevens'

/** Ambiguous-character-free code so it's easy to read out / type on a phone. */
function genJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

/**
 * Private Super Sevens competitions: a named league with a shareable join code.
 * Members are ranked against each other on the active round's leaderboard.
 * There's no wallet or buy-in — Sevens is scored purely on fantasy points.
 */
export class SevensCompsModel {
  static async createComp(userId: number, seasonId: number, rawName: string) {
    const name = (rawName || '').trim()
    if (!name) throw Object.assign(new Error('Give your league a name'), { status: 400 })
    if (name.length > 120) throw Object.assign(new Error('League name is too long (max 120 chars)'), { status: 400 })

    return db.transaction(async (client) => {
      let compId: number | null = null
      let joinCode = ''
      for (let attempt = 0; attempt < 5 && !compId; attempt++) {
        joinCode = genJoinCode()
        const result = await client.query(
          `INSERT INTO sevens_comps (season_id, creator_user_id, name, join_code)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (join_code) DO NOTHING
           RETURNING id`,
          [seasonId, userId, name, joinCode]
        )
        if (result.rows.length > 0) compId = result.rows[0].id
      }
      if (!compId) throw new Error('Could not allocate a join code — try again')

      await client.query(
        `INSERT INTO sevens_comp_members (comp_id, user_id) VALUES ($1, $2)
         ON CONFLICT (comp_id, user_id) DO NOTHING`,
        [compId, userId]
      )
      return { compId, joinCode }
    })
  }

  static async joinComp(userId: number, seasonId: number, code: string) {
    const compResult = await db.query(
      `SELECT id, season_id as "seasonId", name FROM sevens_comps WHERE join_code = $1`,
      [(code || '').trim().toUpperCase()]
    )
    const comp = compResult.rows[0]
    if (!comp || comp.seasonId !== seasonId) throw Object.assign(new Error('League not found — check the code'), { status: 404 })

    const existing = await db.query(
      `SELECT id FROM sevens_comp_members WHERE comp_id = $1 AND user_id = $2`,
      [comp.id, userId]
    )
    if (existing.rows.length > 0) throw Object.assign(new Error("You're already in this league"), { status: 400 })

    await db.query(`INSERT INTO sevens_comp_members (comp_id, user_id) VALUES ($1, $2)`, [comp.id, userId])
    return { compId: comp.id, name: comp.name }
  }

  /** Leagues the user belongs to, with member counts and the shareable code. */
  static async myComps(userId: number, seasonId: number) {
    const result = await db.query(
      `SELECT c.id, c.name, c.join_code as "joinCode", c.creator_user_id as "creatorUserId", c.created_at as "createdAt",
              (SELECT COUNT(*) FROM sevens_comp_members WHERE comp_id = c.id)::int as "memberCount"
       FROM sevens_comps c
       JOIN sevens_comp_members m ON m.comp_id = c.id AND m.user_id = $1
       WHERE c.season_id = $2
       ORDER BY c.created_at DESC`,
      [userId, seasonId]
    )
    return result.rows.map((r: any) => ({ ...r, isOwner: r.creatorUserId === userId }))
  }

  /** This round's leaderboard, scoped to a league's members. */
  static async compLeaderboard(userId: number, seasonId: number, year: number, compId: number) {
    const member = await db.query(
      `SELECT 1 FROM sevens_comp_members WHERE comp_id = $1 AND user_id = $2`,
      [compId, userId]
    )
    if (member.rows.length === 0) throw Object.assign(new Error('Join this league to see its leaderboard'), { status: 403 })

    const comp = await db.query(`SELECT id, name FROM sevens_comps WHERE id = $1 AND season_id = $2`, [compId, seasonId])
    if (comp.rows.length === 0) throw Object.assign(new Error('League not found'), { status: 404 })

    const round = await SevensModel.getActiveRound(seasonId, year)
    if (!round) return { comp: comp.rows[0], leaderboard: [] }

    const members = await db.query(`SELECT user_id as "userId" FROM sevens_comp_members WHERE comp_id = $1`, [compId])
    const memberIds = members.rows.map((r: any) => r.userId)
    const leaderboard = await SevensModel.getLeaderboard(round.id, year, round.round, memberIds)
    return { comp: { id: comp.rows[0].id, name: comp.rows[0].name }, leaderboard }
  }
}
