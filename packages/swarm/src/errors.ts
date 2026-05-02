import { AgentError } from '@x-mars/shared'

/** Handoff 目标找不到 */
export class HandoffTargetError extends AgentError {
  readonly from: string
  readonly to: string

  constructor(from: string, to: string) {
    super(`Handoff target "${to}" not found (from "${from}")`, {
      code: 'SWARM_HANDOFF_TARGET_NOT_FOUND',
    })
    this.name = 'HandoffTargetError'
    this.from = from
    this.to = to
  }
}

/** Handoff 深度超限 */
export class HandoffDepthError extends AgentError {
  readonly depth: number
  readonly maxDepth: number

  constructor(depth: number, maxDepth: number) {
    super(`Handoff depth ${depth} exceeds max ${maxDepth}`, {
      code: 'SWARM_HANDOFF_DEPTH_EXCEEDED',
    })
    this.name = 'HandoffDepthError'
    this.depth = depth
    this.maxDepth = maxDepth
  }
}

/** Handoff 目标不在允许列表内 */
export class HandoffNotAllowedError extends AgentError {
  readonly from: string
  readonly to: string
  readonly allowed: string[]

  constructor(from: string, to: string, allowed: string[]) {
    super(
      `Agent "${from}" is not allowed to handoff to "${to}". Allowed: [${allowed.join(', ')}]`,
      {
        code: 'SWARM_HANDOFF_NOT_ALLOWED',
      },
    )
    this.name = 'HandoffNotAllowedError'
    this.from = from
    this.to = to
    this.allowed = allowed
  }
}

/** 路由找不到合适的 Agent */
export class RoutingError extends AgentError {
  constructor(message: string) {
    super(message, { code: 'SWARM_ROUTING_ERROR' })
    this.name = 'RoutingError'
  }
}

/** 流水线配置错误 */
export class PipelineError extends AgentError {
  constructor(message: string) {
    super(message, { code: 'SWARM_PIPELINE_ERROR' })
    this.name = 'PipelineError'
  }
}

/** Agent 未找到 */
export class AgentNotFoundError extends AgentError {
  readonly agentId: string

  constructor(agentId: string) {
    super(`Agent "${agentId}" not found in swarm`, {
      code: 'SWARM_AGENT_NOT_FOUND',
    })
    this.name = 'AgentNotFoundError'
    this.agentId = agentId
  }
}

/** Swarm 配置无效 */
export class SwarmConfigError extends AgentError {
  constructor(message: string) {
    super(message, { code: 'SWARM_CONFIG_ERROR' })
    this.name = 'SwarmConfigError'
  }
}
