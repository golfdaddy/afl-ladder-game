import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { requireFantasy7Enabled } from '../middleware/fantasyFeature'
import { FantasyCompetitionController } from '../controllers/fantasyCompetition'
import { FantasyCompetitionInviteController } from '../controllers/fantasyCompetitionInvite'
import { FantasyRoundController } from '../controllers/fantasyRound'
import { FantasyLineupController } from '../controllers/fantasyLineup'
import { FantasyLeaderboardController } from '../controllers/fantasyLeaderboard'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(requireFantasy7Enabled)
router.use(authMiddleware)

router.get('/rounds/current', asyncHandler(FantasyRoundController.getCurrentRound))
router.get('/players', asyncHandler(FantasyRoundController.getRoundPlayers))

router.get('/lineups/:competitionId/:roundId/me', asyncHandler(FantasyLineupController.getMyLineup))
router.put('/lineups/:competitionId/:roundId/me', asyncHandler(FantasyLineupController.upsertMyLineup))

router.get('/competitions', asyncHandler(FantasyCompetitionController.getUserCompetitions))
router.post('/competitions', asyncHandler(FantasyCompetitionController.create))
router.get('/competitions/public', asyncHandler(FantasyCompetitionController.getPublic))
router.post('/competitions/join', asyncHandler(FantasyCompetitionController.join))
// Static paths must precede the parameterised /competitions/:id route
router.get('/competitions/invites/mine', asyncHandler(FantasyCompetitionInviteController.getMyInvites))
router.post('/competitions/invites/:token/accept', asyncHandler(FantasyCompetitionInviteController.acceptInvite))
router.post('/competitions/invites/:token/decline', asyncHandler(FantasyCompetitionInviteController.declineInvite))
router.get('/competitions/:id', asyncHandler(FantasyCompetitionController.getById))
router.post('/competitions/:id/invite', asyncHandler(FantasyCompetitionInviteController.invite))
router.get('/competitions/:id/invites', asyncHandler(FantasyCompetitionInviteController.getCompetitionInvites))

router.get('/leaderboards/competition/:competitionId', asyncHandler(FantasyLeaderboardController.getCompetitionWeekly))
router.get('/leaderboards/season/:competitionId', asyncHandler(FantasyLeaderboardController.getCompetitionSeason))

export default router
