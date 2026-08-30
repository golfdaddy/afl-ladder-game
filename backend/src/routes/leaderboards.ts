import { Router } from 'express'
import { LeaderboardController } from '../controllers/leaderboard'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.get('/competition/:competitionId', authMiddleware, asyncHandler(LeaderboardController.getCompetitionLeaderboard))
router.get('/personal/:seasonId', authMiddleware, asyncHandler(LeaderboardController.getUserPersonalLeaderboard))
router.get('/global/:seasonId', authMiddleware, asyncHandler(LeaderboardController.getGlobalLeaderboard))
router.get('/points/:scoreId', authMiddleware, asyncHandler(LeaderboardController.getPointDetails))

export default router
