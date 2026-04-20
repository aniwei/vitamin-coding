import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
