import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import { UserModel } from '../models/user'

/**
 * Middleware that ensures the authenticated user has role='admin'.
 * Must be used AFTER authMiddleware (which sets req.userId).
 */
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const user = await UserModel.findById(req.userId)
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin access required' })
  }

  next()
}
