import { z } from 'zod'

export const SessionConfigSchema = z.looseObject({
  max_turns: z.number().int().positive().optional(),
  max_tokens: z.number().int().positive().optional(),
  auto_compact: z.boolean().optional(),
})
