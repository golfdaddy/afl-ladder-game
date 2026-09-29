import { NextFunction, Request, Response } from 'express'

export function isSevensEnabled(): boolean {
  return process.env.FEATURE_SEVENS_ENABLED === 'true'
}

export function requireSevensEnabled(req: Request, res: Response, next: NextFunction) {
  if (!isSevensEnabled()) {
    return res.status(404).json({ error: 'Super Sevens is not enabled' })
  }
  next()
}
