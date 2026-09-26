import { z } from 'zod'

export const createCompetitionSchema = z.object({
  seasonId: z.number({ required_error: 'seasonId is required' }).int().positive(),
  name: z
    .string({ required_error: 'Competition name is required' })
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be 100 characters or fewer')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or fewer')
    .trim()
    .optional()
    .nullable(),
  isPublic: z.boolean().optional().default(false),
})

export const joinCompetitionSchema = z.object({
  joinCode: z
    .string({ required_error: 'Join code is required' })
    .min(1, 'Join code cannot be empty')
    .trim(),
})

export const inviteSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Invalid email address').toLowerCase(),
})

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>
export type JoinCompetitionInput = z.infer<typeof joinCompetitionSchema>
export type InviteInput = z.infer<typeof inviteSchema>
