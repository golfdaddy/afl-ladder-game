import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'

export interface AuthRequest extends Request {
  userId?: number
}

/**
 * Admin middleware — accepts either:
 *   1. A valid JWT Bearer token (normal user auth), OR
 *   2. An X-Admin-Secret header matching the ADMIN_SECRET env variable
 *
 * Use option 2 for server-side cron jobs / curl without a session.
 */
export function adminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET

  // Check X-Admin-Secret header first (for scripts / cron / curl)
  const headerSecret = req.headers['x-admin-secret']
  if (adminSecret && headerSecret === adminSecret) {
    req.userId = 0 // sentinel — no real user, but auth passed
    return next()
  }

  // Also allow body param (for POST requests that can't set custom headers easily)
  if (adminSecret && req.body?.adminSecret === adminSecret) {
    req.userId = 0
    return next()
  }

  // Fall back to JWT Bearer token
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    const decoded = verifyToken(token)
    if (decoded) {
      req.userId = decoded.userId
      return next()
    }
  }

  return res.status(401).json({
    error: 'Unauthorized — provide X-Admin-Secret header or a valid Bearer token',
  })
}
