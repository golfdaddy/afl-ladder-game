import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { requireSevensEnabled } from '../middleware/sevensFeature'
import { SevensController } from '../controllers/sevens'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(requireSevensEnabled)
router.use(authMiddleware)

router.get('/round', asyncHandler(SevensController.getRound))
router.post('/team', asyncHandler(SevensController.saveTeam))
router.get('/leaderboard', asyncHandler(SevensController.getLeaderboard))

export default router
