import { Router } from 'express'
import { AdminController } from '../controllers/admin'
import { adminAuth } from '../middleware/adminAuth'
import { authMiddleware } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'

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

// Promote by email — callable with just X-Admin-Secret (for first-time setup)
router.post('/promote-email', adminAuth, AdminController.promoteByEmail)

router.get('/health', AdminController.health)

export default router
