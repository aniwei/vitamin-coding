import { z } from 'zod'
import { WorkflowSlotSchema } from './agents'

export const ModelSlotConfigSchema = z.looseObject({
  slots: z.record(WorkflowSlotSchema, z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  default: z.string().optional(),
})
