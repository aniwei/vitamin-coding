import { z } from 'zod'

/**
 * Workflow Slot: 不同工作流阶段可绑定不同模型。
 *
 * 示例配置:
 * ```jsonc
 * {
 *   "model_slots": {
 *     "planning": "github-copilot/o4-mini",
 *     "execution": "github-copilot/gpt-4.1",
 *     "review": "github-copilot/claude-3.5-sonnet",
 *     "compaction": "github-copilot/gpt-4.1-mini",
 *     "vision": "github-copilot/gpt-4o"
 *   }
 * }
 * ```
 */
export const WorkflowSlotSchema = z.enum([
  'planning',
  'execution',
  'review',
  'compaction',
  'vision',
])

export type WorkflowSlot = z.infer<typeof WorkflowSlotSchema>

export const ModelSlotsSchema = z.record(WorkflowSlotSchema, z.string()).optional()
