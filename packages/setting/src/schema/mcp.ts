import { z } from 'zod'

export const McpServerSchema = z.looseObject({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().url().optional(),
})

export const McpConfigSchema = z.looseObject({
  servers: z.record(z.string(), McpServerSchema).optional(),
})
