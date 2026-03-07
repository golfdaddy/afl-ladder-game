import { Router } from 'express'
import { SeasonModel } from '../models/season'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { Response } from 'express'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Get current active season (open or locked — excludes completed)
router.get('/current', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const season = await SeasonModel.getCurrentSeason()
  if (!season) {
    return res.status(404).json({ error: 'No active season found' })
  }
  res.json({ season })
}))

// Get all seasons
router.get('/', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const seasons = await SeasonModel.getAllSeasons()
  res.json({ seasons })
}))

export default router
