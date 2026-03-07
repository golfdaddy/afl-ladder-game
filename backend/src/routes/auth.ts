import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { AuthController } from '../controllers/auth'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Strict limiter for login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Loose limiter for registration: 5 accounts per hour per IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many registrations from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// General limiter for password reset flows: 5 per hour per IP
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/register', registerLimiter, asyncHandler(AuthController.register))
router.post('/login', loginLimiter, asyncHandler(AuthController.login))
router.post('/logout', authMiddleware, asyncHandler(AuthController.logout))
router.get('/me', authMiddleware, asyncHandler(AuthController.getCurrentUser))
router.get('/verify/:token', asyncHandler(AuthController.verifyEmail))
router.post('/forgot-password', passwordResetLimiter, asyncHandler(AuthController.forgotPassword))
router.post('/reset-password', passwordResetLimiter, asyncHandler(AuthController.resetPassword))

export default router
