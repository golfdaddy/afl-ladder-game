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

// Private competitions (leagues)
router.get('/comps', asyncHandler(SevensController.myComps))
router.post('/comps', asyncHandler(SevensController.createComp))
router.post('/comps/join', asyncHandler(SevensController.joinComp))
router.get('/comps/:id/leaderboard', asyncHandler(SevensController.compLeaderboard))

export default router
