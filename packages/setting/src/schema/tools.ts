import { z } from 'zod'

export const ToolPresetSchema = z.enum(['minimal', 'standard', 'full'])

export const ToolsConfigSchema = z.looseObject({
  tool_preset: ToolPresetSchema.optional(),
  disabled_tools: z.array(z.string()).optional(),
})
