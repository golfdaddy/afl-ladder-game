// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken')
import { v4 as uuidv4 } from 'uuid'

const SECRET = process.env.JWT_SECRET || 'dev-secret-key'
const EXPIRY = process.env.JWT_EXPIRY || '24h'

export function generateToken(userId: number): string {
  return jwt.sign({ userId, jti: uuidv4() }, SECRET, { expiresIn: EXPIRY })
}

export function verifyToken(token: string): { userId: number; jti: string } | null {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

export function generateVerificationToken(): string {
  return uuidv4()
}
