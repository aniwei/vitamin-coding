// Agent 错误类型
import { AgentError } from '@vitamin/shared'

// Agent 循环错误
export class AgentLoopError extends AgentError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, { code: 'AGENT_LOOP_ERROR', cause: options?.cause })
    this.name = 'AgentLoopError'
  }
}

// 工具执行错误
export class ToolExecutionError extends AgentError {
  readonly toolName: string
  readonly toolCallId: string

  constructor(toolName: string, toolCallId: string, message: string, options?: { cause?: Error }) {
    super(message, { code: 'AGENT_TOOL_EXECUTION_ERROR', cause: options?.cause })
    this.name = 'ToolExecutionError'
    this.toolName = toolName
    this.toolCallId = toolCallId
  }
}

// Agent 中止错误
export class AbortError extends AgentError {
  constructor(message?: string) {
    super(message ?? 'Agent aborted', { code: 'AGENT_ABORTED' })
    this.name = 'AbortError'
  }
}

// 最大工具轮次错误
export class MaxToolTurnsError extends AgentError {
  readonly maxTurns: number

  constructor(maxTurns: number) {
    super(`Max tool turns exceeded: ${maxTurns}`, { code: 'AGENT_MAX_TOOL_TURNS' })
    this.name = 'MaxToolTurnsError'
    this.maxTurns = maxTurns
  }
}
