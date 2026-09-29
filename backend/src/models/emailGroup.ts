import { db } from '../db'

export interface EmailGroup {
  id: number
  name: string
  description: string | null
  createdAt: Date
}

export class EmailGroupModel {
  /** List all groups */
  static async listGroups(): Promise<EmailGroup[]> {
    const result = await db.query(
      `SELECT id, name, description, created_at as "createdAt"
       FROM email_groups ORDER BY name`
    )
    return result.rows
  }

  /** Get group IDs a user belongs to */
  static async getUserGroupIds(userId: number): Promise<number[]> {
    const result = await db.query(
      `SELECT group_id FROM email_group_members WHERE user_id = $1`,
      [userId]
    )
    return result.rows.map((r) => r.group_id)
  }

  /** Get all groups a user belongs to */
  static async getUserGroups(userId: number): Promise<EmailGroup[]> {
    const result = await db.query(
      `SELECT eg.id, eg.name, eg.description, eg.created_at as "createdAt"
       FROM email_groups eg
       JOIN email_group_members egm ON egm.group_id = eg.id
       WHERE egm.user_id = $1
       ORDER BY eg.name`,
      [userId]
    )
    return result.rows
  }

  /** Add a user to a group (idempotent) */
  static async addUserToGroup(userId: number, groupId: number): Promise<void> {
    await db.query(
      `INSERT INTO email_group_members (group_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [groupId, userId]
    )
  }

  /** Remove a user from a group */
  static async removeUserFromGroup(userId: number, groupId: number): Promise<void> {
    await db.query(
      `DELETE FROM email_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    )
  }

  /** Get all user IDs in a group (for sending emails) */
  static async getUsersInGroup(groupId: number): Promise<number[]> {
    const result = await db.query(
      `SELECT user_id FROM email_group_members WHERE group_id = $1`,
      [groupId]
    )
    return result.rows.map((r) => r.user_id)
  }

  /** Replace a user's mailing-list subscriptions with the provided group IDs */
  static async setUserGroupIds(userId: number, groupIds: number[]): Promise<number[]> {
    const uniqueGroupIds = Array.from(
      new Set(groupIds.filter((groupId) => Number.isInteger(groupId) && groupId > 0))
    )

    return db.transaction(async (client) => {
      const validIdsResult = uniqueGroupIds.length
        ? await client.query(
            `SELECT id
             FROM email_groups
             WHERE id = ANY($1::int[])`,
            [uniqueGroupIds]
          )
        : { rows: [] as Array<{ id: number }> }

      const validGroupIds = validIdsResult.rows.map((row) => Number(row.id))

      await client.query(`DELETE FROM email_group_members WHERE user_id = $1`, [userId])

      if (validGroupIds.length > 0) {
        await client.query(
          `INSERT INTO email_group_members (group_id, user_id)
           SELECT UNNEST($1::int[]), $2`,
          [validGroupIds, userId]
        )
      }

      return validGroupIds
    })
  }
}
