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
router.get('/players', asyncHandler(MultiController.getPlayers))
router.post('/comps', asyncHandler(MultiController.createComp))
router.post('/comps/join', asyncHandler(MultiController.joinComp))
router.get('/comps/public', asyncHandler(MultiController.listPublicComps))
router.post('/comps/:compId/join', asyncHandler(MultiController.joinPublicComp))
router.get('/comps', asyncHandler(MultiController.myComps))
router.get('/comps/:compId/leaderboard', asyncHandler(MultiController.compLeaderboard))
router.post('/bets', asyncHandler(MultiController.placeBet))
router.get('/bets', asyncHandler(MultiController.getMyBets))
router.get('/bets/live', asyncHandler(MultiController.getLiveProgress))
router.get('/leaderboard', asyncHandler(MultiController.getLeaderboard))

export default router
