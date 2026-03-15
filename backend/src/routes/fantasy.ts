import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { requireFantasy7Enabled } from '../middleware/fantasyFeature'
import { FantasyCompetitionController } from '../controllers/fantasyCompetition'
import { FantasyCompetitionInviteController } from '../controllers/fantasyCompetitionInvite'
import { FantasyRoundController } from '../controllers/fantasyRound'
import { FantasyLineupController } from '../controllers/fantasyLineup'
import { FantasyLeaderboardController } from '../controllers/fantasyLeaderboard'

const router = Router()

router.use(requireFantasy7Enabled)
router.use(authMiddleware)

router.get('/rounds/current', FantasyRoundController.getCurrentRound)
router.get('/players', FantasyRoundController.getRoundPlayers)

router.get('/lineups/:competitionId/:roundId/me', FantasyLineupController.getMyLineup)
router.put('/lineups/:competitionId/:roundId/me', FantasyLineupController.upsertMyLineup)

router.get('/competitions', FantasyCompetitionController.getUserCompetitions)
router.post('/competitions', FantasyCompetitionController.create)
router.get('/competitions/public', FantasyCompetitionController.getPublic)
router.post('/competitions/join', FantasyCompetitionController.join)
router.get('/competitions/:id', FantasyCompetitionController.getById)
router.post('/competitions/:id/invite', FantasyCompetitionInviteController.invite)
router.get('/competitions/:id/invites', FantasyCompetitionInviteController.getCompetitionInvites)
router.get('/competitions/invites/mine', FantasyCompetitionInviteController.getMyInvites)
router.post('/competitions/invites/:token/accept', FantasyCompetitionInviteController.acceptInvite)
router.post('/competitions/invites/:token/decline', FantasyCompetitionInviteController.declineInvite)

router.get('/leaderboards/competition/:competitionId', FantasyLeaderboardController.getCompetitionWeekly)
router.get('/leaderboards/season/:competitionId', FantasyLeaderboardController.getCompetitionSeason)

export default router
