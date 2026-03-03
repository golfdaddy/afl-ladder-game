import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { registerSchema, loginSchema, RegisterInput, LoginInput } from '../schemas/auth'
import { UserModel } from '../models/user'
import { generateToken, generateVerificationToken } from '../utils/jwt'

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
}
