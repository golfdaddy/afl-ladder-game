import { Router } from 'express'
import { PredictionController } from '../controllers/prediction'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.post('/', authMiddleware, asyncHandler(PredictionController.submit))
router.get('/:seasonId/user/:userId', authMiddleware, asyncHandler(PredictionController.getByUserForViewing))
router.get('/:seasonId', authMiddleware, asyncHandler(PredictionController.getBySeasonId))
router.put('/:id', authMiddleware, asyncHandler(PredictionController.update))

export default router
