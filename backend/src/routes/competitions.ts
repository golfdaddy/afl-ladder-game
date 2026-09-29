import { Router } from 'express'
import { CompetitionController } from '../controllers/competition'
import { CompetitionInviteController } from '../controllers/competitionInvite'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.post('/', authMiddleware, asyncHandler(CompetitionController.create))
router.get('/', authMiddleware, asyncHandler(CompetitionController.getUserCompetitions))
router.get('/public', authMiddleware, asyncHandler(CompetitionController.getPublic))
router.post('/join', authMiddleware, asyncHandler(CompetitionController.join))

// Invite routes
router.get('/invites/mine', authMiddleware, asyncHandler(CompetitionInviteController.getMyInvites))
router.post('/invites/:token/accept', authMiddleware, asyncHandler(CompetitionInviteController.acceptInvite))
router.post('/invites/:token/decline', authMiddleware, asyncHandler(CompetitionInviteController.declineInvite))
router.post('/:id/invite', authMiddleware, asyncHandler(CompetitionInviteController.invite))
router.get('/:id/invites', authMiddleware, asyncHandler(CompetitionInviteController.getCompetitionInvites))

// Member predictions (revealed post-lockout)
router.get('/:id/predictions', authMiddleware, asyncHandler(CompetitionController.getCompetitionPredictions))

// This must be LAST since :id is a catch-all param
router.get('/:id', authMiddleware, asyncHandler(CompetitionController.getById))

export default router
