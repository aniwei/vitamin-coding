import { z } from 'zod'

export const CompactionStrategySchema = z.enum([
  'summary',
  'sliding-window',
  'incremental',
])

export const CompactionConfigSchema = z.looseObject({
  strategy: CompactionStrategySchema.optional(),
  retain_recent: z.number().int().positive().optional(),
  auto_compact: z.boolean().optional(),
  threshold_tokens: z.number().int().positive().optional(),
  preserve_todos: z.boolean().optional(),
})
