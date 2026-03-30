import { z } from 'zod'

export const WorkflowReviewSchema = z.looseObject({
  /** 是否在子 agent 完成后自动执行质量审查 */
  enabled: z.boolean().optional(),
})

export const WorkflowRetrySchema = z.looseObject({
  /** 是否启用任务自动重试 */
  enabled: z.boolean().optional(),
  /** 最大尝试次数 */
  max_attempts: z.number().int().positive().optional(),
})

export const WorkflowCircuitBreakerSchema = z.looseObject({
  /** 是否启用熔断器 */
  enabled: z.boolean().optional(),
  /** 连续失败多少次后开启熔断 */
  failure_threshold: z.number().int().positive().optional(),
  /** 熔断恢复超时 (ms) */
  reset_timeout_ms: z.number().int().positive().optional(),
})

export const WorkflowRoutingSchema = z.looseObject({
  /** 是否启用智能 agent 路由 */
  enabled: z.boolean().optional(),
})

export const WorkflowConfigSchema = z.looseObject({
  /** 总开关: 是否启用默认工程工作流 (默认 true) */
  enabled: z.boolean().optional(),
  review: WorkflowReviewSchema.optional(),
  retry: WorkflowRetrySchema.optional(),
  circuit_breaker: WorkflowCircuitBreakerSchema.optional(),
  routing: WorkflowRoutingSchema.optional(),
})
