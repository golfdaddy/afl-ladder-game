import { Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { AuthRequest } from '../middleware/auth'
import { registerSchema, loginSchema, RegisterInput, LoginInput } from '../schemas/auth'
import { UserModel } from '../models/user'
import { generateToken, generateVerificationToken } from '../utils/jwt'
import { sendPasswordResetEmail } from '../services/email'

export class AuthController {
  static async register(req: AuthRequest, res: Response) {
    try {
      const data = registerSchema.parse(req.body)

      // Check if user already exists
      const existing = await UserModel.findByEmail(data.email)
      if (existing) {
        return res.status(400).json({ error: 'Email already registered' })
      }

      // Create user
      const user = await UserModel.create(data.email, data.displayName, data.password)

      // Generate verification token
      const verificationToken = generateVerificationToken()
      await UserModel.setVerificationToken(user.id, verificationToken)

      // TODO: Send verification email with token

      res.status(201).json({
        message: 'Registration successful. Please verify your email.',
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          role: user.role,
        }
      })
    } catch (error: any) {
      if (error.issues) {
        return res.status(400).json({ error: error.issues[0].message })
      }
      res.status(500).json({ error: 'Registration failed' })
    }
  }

  static async login(req: AuthRequest, res: Response) {
    try {
      const data = loginSchema.parse(req.body)

      const user = await UserModel.findByEmail(data.email)
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const passwordValid = await UserModel.verifyPassword(data.email, data.password)
      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const token = generateToken(user.id)

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          role: user.role,
        }
      })
    } catch (error: any) {
      if (error.issues) {
        return res.status(400).json({ error: error.issues[0].message })
      }
      res.status(500).json({ error: 'Login failed' })
    }
  }

  static async getCurrentUser(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const user = await UserModel.findById(req.userId)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          role: user.role,
        }
      })
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' })
    }
  }

  static async verifyEmail(req: AuthRequest, res: Response) {
    try {
      const { token } = req.params

      const user = await UserModel.findByVerificationToken(token)
      if (!user) {
        return res.status(400).json({ error: 'Invalid verification token' })
      }

      await UserModel.markEmailVerified(user.id)

      res.json({ message: 'Email verified successfully' })
    } catch (error) {
      res.status(500).json({ error: 'Email verification failed' })
    }
  }

  static async logout(req: AuthRequest, res: Response) {
    // JWT is stateless, so logout just happens on client
    res.json({ message: 'Logged out successfully' })
  }

  static async forgotPassword(req: AuthRequest, res: Response) {
    try {
      const { email } = req.body
      if (!email) {
        return res.status(400).json({ error: 'Email is required' })
      }

      const user = await UserModel.findByEmail(email)
      // Always return the same message to avoid revealing whether the email exists
      const okMsg = { message: 'If that email is registered, you will receive a reset link shortly.' }

      if (!user) return res.json(okMsg)

      const resetToken = uuidv4()
      const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      await UserModel.setPasswordResetToken(user.id, resetToken, expires)

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`

      // Respond immediately — don't block on the email send (SMTP can be slow/hang)
      res.json(okMsg)

      // Fire-and-forget: send email in background after response is sent
      sendPasswordResetEmail(user.email, resetUrl).catch((err) => {
        console.error('[ForgotPassword] Email send failed:', err.message)
      })
    } catch (error) {
      console.error('Forgot password error:', error)
      res.status(500).json({ error: 'Failed to process request' })
    }
  }

  static async resetPassword(req: AuthRequest, res: Response) {
    try {
      const { token, password } = req.body
      if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required' })
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' })
      }

      const user = await UserModel.findByPasswordResetToken(token)
      if (!user) {
        return res.status(400).json({ error: 'This reset link has expired or is invalid. Please request a new one.' })
      }

      await UserModel.resetPassword(user.id, password)
      res.json({ message: 'Password reset successfully. You can now sign in.' })
    } catch (error) {
      console.error('Reset password error:', error)
      res.status(500).json({ error: 'Failed to reset password' })
    }
  }
}
