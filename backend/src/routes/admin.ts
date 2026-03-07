import { Router } from 'express'
import { AdminController } from '../controllers/admin'
import { adminAuth } from '../middleware/adminAuth'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { requireFantasy7Enabled } from '../middleware/fantasyFeature'
import { FantasyAdminController } from '../controllers/fantasyAdmin'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Public — anyone can view the current ladder
router.get('/afl-ladder/:seasonId', asyncHandler(AdminController.getLatestLadder))

// Admin-only ladder ops — requires X-Admin-Secret header or valid Bearer token
router.post('/afl-ladder', adminAuth, asyncHandler(AdminController.uploadAFLLadder))
router.post('/sync-ladder', adminAuth, asyncHandler(AdminController.syncFromSquiggle))

// User management — requires JWT + admin role
router.get('/users', authMiddleware, requireAdmin, asyncHandler(AdminController.listUsers))
router.put('/users/:id/role', authMiddleware, requireAdmin, asyncHandler(AdminController.setUserRole))
router.put('/seasons/:seasonId/cutoff', authMiddleware, requireAdmin, asyncHandler(AdminController.setSeasonCutoff))
router.get('/email/templates', authMiddleware, requireAdmin, asyncHandler(AdminController.listEmailTemplates))
router.post('/email/templates', authMiddleware, requireAdmin, asyncHandler(AdminController.createEmailTemplate))
router.put('/email/templates/:id', authMiddleware, requireAdmin, asyncHandler(AdminController.updateEmailTemplate))
router.delete('/email/templates/:id', authMiddleware, requireAdmin, asyncHandler(AdminController.deleteEmailTemplate))
router.post('/email/templates/preview', authMiddleware, requireAdmin, asyncHandler(AdminController.previewEmailTemplate))
router.post('/email/templates/:id/send', authMiddleware, requireAdmin, asyncHandler(AdminController.sendEmailTemplate))

// Users + groups combined (for admin UI)
router.get('/users-with-groups', authMiddleware, requireAdmin, asyncHandler(AdminController.listUsersWithGroups))

// Email group membership
router.get('/email-groups', authMiddleware, requireAdmin, asyncHandler(AdminController.listEmailGroups))
router.get('/users/:userId/email-groups', authMiddleware, requireAdmin, asyncHandler(AdminController.getUserEmailGroups))
router.post('/users/:userId/email-groups/:groupId', authMiddleware, requireAdmin, asyncHandler(AdminController.addUserToEmailGroup))
router.delete('/users/:userId/email-groups/:groupId', authMiddleware, requireAdmin, asyncHandler(AdminController.removeUserFromEmailGroup))

// Export all ladder predictions as CSV/JSON (admin only)
router.get('/export/predictions', authMiddleware, requireAdmin, asyncHandler(AdminController.exportPredictions))

// Promote by email — callable with just X-Admin-Secret (for first-time setup)
router.post('/promote-email', adminAuth, asyncHandler(AdminController.promoteByEmail))

router.get('/health', asyncHandler(AdminController.health))

// Fantasy 7 admin ops — JWT admin only, feature-flagged
router.get('/fantasy/health', requireFantasy7Enabled, authMiddleware, requireAdmin, asyncHandler(FantasyAdminController.health))
router.post('/fantasy/sync/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, asyncHandler(FantasyAdminController.syncRound))
router.post('/fantasy/price/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, asyncHandler(FantasyAdminController.priceRound))
router.post('/fantasy/scores/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, asyncHandler(FantasyAdminController.ingestScores))
router.post('/fantasy/recompute/round/:roundId', requireFantasy7Enabled, authMiddleware, requireAdmin, asyncHandler(FantasyAdminController.recomputeRound))

export default router
