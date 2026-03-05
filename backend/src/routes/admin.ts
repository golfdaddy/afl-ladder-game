import { Router } from 'express'
import { AdminController } from '../controllers/admin'
import { adminAuth } from '../middleware/adminAuth'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { requireFantasy7Enabled } from '../middleware/fantasyFeature'
import { FantasyAdminController } from '../controllers/fantasyAdmin'

const router = Router()

// Public — anyone can view the current ladder
router.get('/afl-ladder/:seasonId', AdminController.getLatestLadder)

// Admin-only ladder ops — requires X-Admin-Secret header or valid Bearer token
router.post('/afl-ladder', adminAuth, AdminController.uploadAFLLadder)
router.post('/sync-ladder', adminAuth, AdminController.syncFromSquiggle)

// User management — requires JWT + admin role
router.get('/users', authMiddleware, requireAdmin, AdminController.listUsers)
router.put('/users/:id/role', authMiddleware, requireAdmin, AdminController.setUserRole)

// Users + groups combined (for admin UI)
router.get('/users-with-groups', authMiddleware, requireAdmin, AdminController.listUsersWithGroups)

// Email group membership
router.get('/email-groups', authMiddleware, requireAdmin, AdminController.listEmailGroups)
router.get('/users/:userId/email-groups', authMiddleware, requireAdmin, AdminController.getUserEmailGroups)
router.post('/users/:userId/email-groups/:groupId', authMiddleware, requireAdmin, AdminController.addUserToEmailGroup)
router.delete('/users/:userId/email-groups/:groupId', authMiddleware, requireAdmin, AdminController.removeUserFromEmailGroup)

// Export all ladder predictions as CSV/JSON (admin only)
router.get('/export/predictions', authMiddleware, requireAdmin, AdminController.exportPredictions)

// Promote by email — callable with just X-Admin-Secret (for first-time setup)
router.post('/promote-email', adminAuth, AdminController.promoteByEmail)

router.get('/health', AdminController.health)

// Fantasy 7 admin ops — JWT admin only, feature-flagged
router.get('/fantasy/health', requireFantasy7Enabled, authMiddleware, requireAdmin, FantasyAdminController.health)
router.post('/fantasy/sync/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, FantasyAdminController.syncRound)
router.post('/fantasy/price/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, FantasyAdminController.priceRound)
router.post('/fantasy/scores/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, FantasyAdminController.ingestScores)
router.post('/fantasy/recompute/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, FantasyAdminController.recomputeRound)

export default router
