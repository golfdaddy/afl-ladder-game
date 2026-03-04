import { Router } from 'express'
import { AuthController } from '../controllers/auth'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/register', AuthController.register)
router.post('/login', AuthController.login)
router.post('/logout', authMiddleware, AuthController.logout)
router.get('/me', authMiddleware, AuthController.getCurrentUser)
router.get('/verify/:token', AuthController.verifyEmail)
router.post('/forgot-password', AuthController.forgotPassword)
router.post('/reset-password', AuthController.resetPassword)

export default router
