import { NextFunction, Request, Response } from 'express'

export function isFantasy7Enabled(): boolean {
  return process.env.FEATURE_FANTASY7_ENABLED === 'true'
}

export function requireFantasy7Enabled(req: Request, res: Response, next: NextFunction) {
  if (!isFantasy7Enabled()) {
    return res.status(404).json({ error: 'Fantasy 7 feature is not enabled' })
  }
  next()
}
