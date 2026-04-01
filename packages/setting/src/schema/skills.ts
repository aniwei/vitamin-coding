import { z } from 'zod'

export const SkillsConfigSchema = z.looseObject({
  enabled: z.array(z.string()).optional(),
  disabled: z.array(z.string()).optional(),
})
