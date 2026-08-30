import { z } from 'zod'

const AFL_TEAM_COUNT = 18

const predictedTeamSchema = z.object({
  position: z
    .number({ required_error: 'position is required' })
    .int()
    .min(1, 'Position must be between 1 and 18')
    .max(AFL_TEAM_COUNT, 'Position must be between 1 and 18'),
  teamName: z
    .string({ required_error: 'teamName is required' })
    .min(1, 'Team name cannot be empty')
    .trim(),
})

export const submitPredictionSchema = z.object({
  seasonId: z.number({ required_error: 'seasonId is required' }).int().positive(),
  teams: z
    .array(predictedTeamSchema)
    .length(AFL_TEAM_COUNT, `Prediction must include exactly ${AFL_TEAM_COUNT} teams`)
    .refine(
      (teams) => {
        // All positions must be unique (1–18 each used exactly once)
        const positions = teams.map((t) => t.position)
        return new Set(positions).size === AFL_TEAM_COUNT
      },
      { message: 'Each position (1–18) must be used exactly once' }
    )
    .refine(
      (teams) => {
        // All team names must be unique
        const names = teams.map((t) => t.teamName.toLowerCase())
        return new Set(names).size === AFL_TEAM_COUNT
      },
      { message: 'Each team name must appear exactly once' }
    ),
})

export const updatePredictionSchema = z.object({
  teams: z
    .array(predictedTeamSchema)
    .length(AFL_TEAM_COUNT, `Prediction must include exactly ${AFL_TEAM_COUNT} teams`)
    .refine(
      (teams) => {
        const positions = teams.map((t) => t.position)
        return new Set(positions).size === AFL_TEAM_COUNT
      },
      { message: 'Each position (1–18) must be used exactly once' }
    )
    .refine(
      (teams) => {
        const names = teams.map((t) => t.teamName.toLowerCase())
        return new Set(names).size === AFL_TEAM_COUNT
      },
      { message: 'Each team name must appear exactly once' }
    ),
})

export type SubmitPredictionInput = z.infer<typeof submitPredictionSchema>
export type UpdatePredictionInput = z.infer<typeof updatePredictionSchema>
