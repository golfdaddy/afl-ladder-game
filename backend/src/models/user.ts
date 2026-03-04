import { db } from '../db'
import { hashPassword, verifyPassword } from '../utils/password'

export type UserRole = 'user' | 'admin'

export interface User {
  id: number
  email: string
  displayName: string
  emailVerified: boolean
  role: UserRole
  createdAt: Date
}

export interface UserWithStats extends User {
  predictionCount: number
  competitionCount: number
}

export class UserModel {
  static async create(email: string, displayName: string, password: string): Promise<User> {
    const passwordHash = await hashPassword(password)
    const result = await db.query(
      `INSERT INTO users (email, display_name, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, email, display_name as "displayName", email_verified as "emailVerified",
                 role, created_at as "createdAt"`,
      [email, displayName, passwordHash]
    )
    return result.rows[0]
  }

  static async findByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const result = await db.query(
      `SELECT id, email, display_name as "displayName", password_hash as "passwordHash",
              email_verified as "emailVerified", role, created_at as "createdAt"
       FROM users WHERE email = $1`,
      [email]
    )
    return result.rows[0] || null
  }

  static async findById(id: number): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, display_name as "displayName", email_verified as "emailVerified",
              role, created_at as "createdAt"
       FROM users WHERE id = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  static async verifyPassword(email: string, password: string): Promise<boolean> {
    const user = await this.findByEmail(email)
    if (!user) return false
    return verifyPassword(password, user.passwordHash)
  }

  static async markEmailVerified(id: number): Promise<void> {
    await db.query(
      `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
      [id]
    )
  }

  static async setVerificationToken(id: number, token: string): Promise<void> {
    await db.query(
      `UPDATE users SET verification_token = $1, updated_at = NOW() WHERE id = $2`,
      [token, id]
    )
  }

  static async findByVerificationToken(token: string): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, display_name as "displayName", email_verified as "emailVerified",
              role, created_at as "createdAt"
       FROM users WHERE verification_token = $1`,
      [token]
    )
    return result.rows[0] || null
  }

  /** Admin: list all users with prediction + competition counts */
  static async listAll(): Promise<UserWithStats[]> {
    const result = await db.query(
      `SELECT u.id, u.email, u.display_name as "displayName",
              u.email_verified as "emailVerified", u.role,
              u.created_at as "createdAt",
              COUNT(DISTINCT p.id) as "predictionCount",
              COUNT(DISTINCT cm.id) as "competitionCount"
       FROM users u
       LEFT JOIN predictions p ON p.user_id = u.id
       LEFT JOIN competition_members cm ON cm.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    )
    return result.rows.map((r) => ({
      ...r,
      predictionCount: parseInt(r.predictionCount),
      competitionCount: parseInt(r.competitionCount),
    }))
  }

  /** Admin: update a user's role by ID */
  static async setRole(userId: number, role: UserRole): Promise<User | null> {
    const result = await db.query(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, display_name as "displayName", email_verified as "emailVerified",
                 role, created_at as "createdAt"`,
      [role, userId]
    )
    return result.rows[0] || null
  }

  /** Set a password-reset token with a 1-hour expiry */
  static async setPasswordResetToken(id: number, token: string, expires: Date): Promise<void> {
    await db.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW() WHERE id = $3`,
      [token, expires, id]
    )
  }

  /** Find a user by a valid (unexpired) password reset token */
  static async findByPasswordResetToken(token: string): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, display_name as "displayName", email_verified as "emailVerified",
              role, created_at as "createdAt"
       FROM users
       WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    )
    return result.rows[0] || null
  }

  /** Reset a user's password and clear the reset token */
  static async resetPassword(id: number, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword)
    await db.query(
      `UPDATE users
       SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, id]
    )
  }

  /** Admin: promote a user to admin by email (useful for first-time setup) */
  static async setRoleByEmail(email: string, role: UserRole): Promise<User | null> {
    const result = await db.query(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE email = $2
       RETURNING id, email, display_name as "displayName", email_verified as "emailVerified",
                 role, created_at as "createdAt"`,
      [role, email]
    )
    return result.rows[0] || null
  }
}
