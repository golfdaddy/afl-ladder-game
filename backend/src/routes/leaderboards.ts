import { Router } from 'express'
import { LeaderboardController } from '../controllers/leaderboard'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.get('/competition/:competitionId', authMiddleware, LeaderboardController.getCompetitionLeaderboard)
router.get('/personal/:seasonId', authMiddleware, LeaderboardController.getUserPersonalLeaderboard)
router.get('/global/:seasonId', authMiddleware, LeaderboardController.getGlobalLeaderboard)
router.get('/points/:scoreId', authMiddleware, LeaderboardController.getPointDetails)

export default router
