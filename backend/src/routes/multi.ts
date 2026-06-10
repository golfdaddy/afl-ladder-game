import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { requireMultiEnabled } from '../middleware/multiFeature'
import { MultiController } from '../controllers/multi'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(requireMultiEnabled)
router.use(authMiddleware)

router.get('/account', asyncHandler(MultiController.getAccount))
router.get('/markets', asyncHandler(MultiController.getMarkets))
router.get('/markets/:gameId/props', asyncHandler(MultiController.getGameProps))
router.post('/bets', asyncHandler(MultiController.placeBet))
router.get('/bets', asyncHandler(MultiController.getMyBets))
router.get('/leaderboard', asyncHandler(MultiController.getLeaderboard))

export default router
