import { Router } from 'express'
import { SeasonModel } from '../models/season'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { Response } from 'express'

const router = Router()

// Get current active season
router.get('/current', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const season = await SeasonModel.getCurrentSeason()
    if (!season) {
      return res.status(404).json({ error: 'No active season found' })
    }
    res.json({ season })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch season' })
  }
})

// Get all seasons
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const seasons = await SeasonModel.getAllSeasons()
    res.json({ seasons })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seasons' })
  }
})

export default router
