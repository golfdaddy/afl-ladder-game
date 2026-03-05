import { Router } from 'express'
import { PredictionController } from '../controllers/prediction'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/', authMiddleware, PredictionController.submit)
router.get('/:seasonId/user/:userId', authMiddleware, PredictionController.getByUserForViewing)
router.get('/:seasonId', authMiddleware, PredictionController.getBySeasonId)
router.put('/:id', authMiddleware, PredictionController.update)

export default router
