import { ZodError } from 'zod'
import { Response } from 'express'

/**
 * Sends a 400 response with the first Zod validation error message.
 * Returns true so callers can `return zodError(res, err)` without an extra return.
 */
export function zodError(res: Response, err: ZodError): true {
  const message = err.errors[0]?.message ?? 'Validation error'
  res.status(400).json({ error: message })
  return true
}
