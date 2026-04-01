import { z } from 'zod'

export const CategoryConfigSchema = z.looseObject({
  preferred_models: z.array(z.string()).optional(),
  default_model: z.string().optional(),
})

export const CategoriesConfigSchema = z.record(z.string(), CategoryConfigSchema)
