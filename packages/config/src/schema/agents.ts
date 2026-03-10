import { z } from 'zod'

export const AgentConfigSchema = z.looseObject({
  model: z.string().optional(), // 模型名称
  temperature: z.number().min(0).max(2).optional(), 
  max_tokens: z.number().int().positive().optional(), // 最大生成长度
  thinking_budget: z.number().int().positive().optional(),
  disabled: z.boolean().optional(),
})

export const AgentsConfigSchema = z.record(z.string(), AgentConfigSchema)
