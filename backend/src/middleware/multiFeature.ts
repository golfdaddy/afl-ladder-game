import { NextFunction, Request, Response } from 'express'

export function isMultiEnabled(): boolean {
  return process.env.FEATURE_MULTI_ENABLED === 'true'
}

export function requireMultiEnabled(req: Request, res: Response, next: NextFunction) {
  if (!isMultiEnabled()) {
    return res.status(404).json({ error: 'Multi feature is not enabled' })
  }
  next()
}
