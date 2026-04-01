import { z } from 'zod'

export const BackgroundTaskConfigSchema = z.looseObject({
  concurrency: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
})

export const ExperimentalConfigSchema = z.looseObject({
  features: z.record(z.string(), z.boolean()).optional(),
  background_task: BackgroundTaskConfigSchema.optional(),
})
