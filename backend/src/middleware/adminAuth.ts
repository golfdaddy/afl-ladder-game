import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { UserModel } from '../models/user'

export interface AuthRequest extends Request {
  userId?: number
}

/**
 * Admin middleware — accepts either:
 *   1. An X-Admin-Secret header / body param (for cron jobs / curl without a session)
 *   2. A valid JWT Bearer token belonging to a user with role='admin'
 *
 * Note: option 1 is intentionally stateless (no DB lookup) so it works for
 * first-time bootstrap before any admin users exist.
 */
export async function adminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET

  // 1. X-Admin-Secret header (scripts / cron / Railway one-off commands)
  const headerSecret = req.headers['x-admin-secret']
  if (adminSecret && headerSecret === adminSecret) {
    req.userId = 0 // sentinel — no real user, but auth passed
    return next()
  }

  // 2. Also allow body param (for POST requests that can't set custom headers easily)
  if (adminSecret && req.body?.adminSecret === adminSecret) {
    req.userId = 0
    return next()
  }

  // 3. JWT Bearer — must belong to an admin-role user
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    const decoded = verifyToken(token)
    if (decoded) {
      const user = await UserModel.findById(decoded.userId)
      if (user?.role === 'admin') {
        req.userId = decoded.userId
        return next()
      }
      // Valid JWT but not an admin → 403, not 401
      return res.status(403).json({ error: 'Forbidden — admin role required' })
    }
  }

  return res.status(401).json({
    error: 'Unauthorized — provide X-Admin-Secret header or an admin Bearer token',
  })
}
