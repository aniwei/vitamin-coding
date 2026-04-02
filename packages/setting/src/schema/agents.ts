import { z } from 'zod'

export const WorkflowSlotSchema = z.enum([
  'normal',
  'thinking',
  'compact',
  'critique',
  'vision',
])

export const AgentConfigSchema = z.looseObject({
  model: z.string().optional(), // 模型名称
  description: z.string().optional(),
  system_prompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  default_workflow_slot: WorkflowSlotSchema.optional(),
  max_tool_turns: z.number().int().nonnegative().optional(),
  temperature: z.number().min(0).max(2).optional(), 
  max_tokens: z.number().int().positive().optional(), // 最大生成长度
  thinking_budget: z.number().int().positive().optional(),
  disabled: z.boolean().optional(),
})

export const AgentsConfigSchema = z.record(z.string(), AgentConfigSchema)

/** 内置 reviewer agent 预设 */
export const BUILTIN_REVIEWER_AGENTS: Record<string, z.infer<typeof AgentConfigSchema>> = {
  'spec-reviewer': {
    description: 'Reviews implementation against specification requirements',
    categories: ['review'],
    default_workflow_slot: 'critique',
  },
  'quality-reviewer': {
    description: 'Reviews code quality, patterns, and best practices',
    categories: ['review'],
    default_workflow_slot: 'critique',
  },
}
