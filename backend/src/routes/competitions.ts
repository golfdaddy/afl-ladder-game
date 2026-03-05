import { Router } from 'express'
import { CompetitionController } from '../controllers/competition'
import { CompetitionInviteController } from '../controllers/competitionInvite'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/', authMiddleware, CompetitionController.create)
router.get('/', authMiddleware, CompetitionController.getUserCompetitions)
router.get('/public', authMiddleware, CompetitionController.getPublic)
router.post('/join', authMiddleware, CompetitionController.join)

// Invite routes
router.get('/invites/mine', authMiddleware, CompetitionInviteController.getMyInvites)
router.post('/invites/:token/accept', authMiddleware, CompetitionInviteController.acceptInvite)
router.post('/invites/:token/decline', authMiddleware, CompetitionInviteController.declineInvite)
router.post('/:id/invite', authMiddleware, CompetitionInviteController.invite)
router.get('/:id/invites', authMiddleware, CompetitionInviteController.getCompetitionInvites)

// Member predictions (revealed post-lockout)
router.get('/:id/predictions', authMiddleware, CompetitionController.getCompetitionPredictions)

// This must be LAST since :id is a catch-all param
router.get('/:id', authMiddleware, CompetitionController.getById)

export default router
