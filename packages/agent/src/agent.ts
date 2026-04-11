import {
  createLogger,
  TypedEventEmitter,
} from '@vitamin/shared'

import { workLoop } from './work-loop'
import { AbortError } from './errors'
import { createToolExecutor } from './tool-executor'

import type { AssistantMessage, Message as LlmMessage } from '@vitamin/ai'
import type {
  AgentConfig,
  AgentEvent,
  AgentMessage,
  AgentRunContext,
  AgentState,
  AgentStatus,
  ToolCallEvent,
  ToolResult,
} from './types'
import type { Events } from '@vitamin/shared'
import type { StreamEvent } from '@vitamin/ai'

const logger = createLogger('@vitamin/agent')

// Agent 状态合法转换表
const VALID_TRANSITIONS: Record<AgentStatus, Set<AgentStatus>> = {
  idle: new Set(['streaming', 'aborted', 'error']),
  streaming: new Set(['tool_executing', 'completed', 'aborted', 'error']),
  tool_executing: new Set(['streaming', 'aborted', 'error']),
  completed: new Set(['streaming', 'idle', 'aborted', 'error']),
  error: new Set(['idle', 'aborted']),
  aborted: new Set(['streaming', 'idle', 'error']),
}

// Agent 事件映射
interface AgentEvents extends Events {
  status_change: (event: { from: AgentStatus; to: AgentStatus }) => void
  turn_start: (event: { turnIndex: number }) => void
  turn_end: (event: { turnIndex: number; message: AssistantMessage }) => void
  stream_event: (event: StreamEvent) => void
  streaming_start: (event: { model: string }) => void
  streaming_end: (event: { model: string; stopReason: string }) => void
  tool_call_start: (event: { toolCall: ToolCallEvent }) => void
  tool_call_end: (event: { toolCall: ToolCallEvent; result: ToolResult }) => void
  tool_result_received: (event: { toolCallId: string; isError: boolean }) => void
  messages_updated: (event: { count: number }) => void
  steering_injected: (event: { messages: AgentMessage[] }) => void
  follow_up_start: (event: { messages: AgentMessage[] }) => void
  error: (error: Error) => void
  abort: () => void
  compaction_needed: (event: { tokenCount: number; threshold: number }) => void
}

export class Agent extends TypedEventEmitter<AgentEvents> {
  private state: AgentState
  private abortController: AbortController | null = null
  private steeringQueue: AgentMessage[] = []
  private followUpQueue: AgentMessage[] = []

  // 基础设施配置 — 构造时确定，所有 run() 共享
  private readonly stream: import('./types').StreamFunction
  private readonly agentLogger: import('@vitamin/shared').Logger
  private readonly maxToolTurns: number
  private readonly agentName: string
  private readonly sessionId: string
  private readonly toolHookExecutor?: import('./types').ToolHookExecutor
  private readonly devtools?: import('@vitamin/devtools').Devtools
  private readonly approval?: (toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>

  get status(): AgentStatus {
    return this.state.status
  }

  get turnCount(): number {
    return this.state.turnCount
  }

  constructor(config: AgentConfig) {
    super()

    this.stream = config.stream
    this.agentLogger = config.logger
    this.maxToolTurns = config.maxToolTurns ?? 25
    this.agentName = config.agentName ?? ''
    this.sessionId = config.sessionId ?? ''
    this.toolHookExecutor = config.toolHookExecutor
    this.devtools = config.devtools
    this.approval = config.approval

    this.state = {
      status: 'idle',
      turnCount: 0,
      tokenUsage: { input: 0, output: 0, cacheRead: 0 },
      isStreaming: false,
      currentStreamMessage: null,
      error: undefined,
    }
  }

  // 获取当前状态快照
  getState(): Readonly<AgentState> {
    return { ...this.state }
  }

  // 核心方法 — 执行 Agent 循环。
  // messages 数组会被 workLoop 就地修改（追加 assistant/tool_result 消息），
  // 调用方负责将变更持久化到 Session。
  async run(context: AgentRunContext): Promise<AssistantMessage> {
    if (
      this.state.status !== 'idle' &&
      this.state.status !== 'completed' &&
      this.state.status !== 'aborted'
    ) {
      throw new Error(`Cannot run in ${this.state.status} status`)
    }

    return this.runLoop(context)
  }

  steer(message: AgentMessage): void {
    this.steeringQueue.push(message)
  }

  followUp(message: AgentMessage): void {
    this.followUpQueue.push(message)
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }

    this.transitionTo('aborted')
    this.emit('abort')
  }

  reset(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    this.steeringQueue = []
    this.followUpQueue = []
    this.state.turnCount = 0
    this.state.tokenUsage = { input: 0, output: 0, cacheRead: 0 }
    this.state.currentStreamMessage = null
    this.state.error = undefined
    this.state.status = 'idle'
  }

  private async runLoop(context: AgentRunContext): Promise<AssistantMessage> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const toolExecutor = createToolExecutor(context.tools, {
      hookExecutor: this.toolHookExecutor,
      agentName: this.agentName,
      sessionId: this.sessionId,
      devtools: this.devtools,
      approval: this.approval,
    })

    try {
      const result = await workLoop({
        // 执行参数（来自 AgentRunContext）
        model: context.model,
        systemPrompt: context.systemPrompt,
        messages: context.messages,
        thinkingLevel: context.thinkingLevel,
        maxTokens: context.maxTokens,
        temperature: context.temperature,
        convertToLLM: context.convertToLLM ?? defaultConvertToLLM,
        transformContext: context.transformContext,
        // 配置（来自 AgentConfig，在 Agent 实例间共享）
        maxToolTurns: this.maxToolTurns,
        devtools: this.devtools,
        logger: this.agentLogger,
        // 队列接入
        getSteeringMessages: () => this.drainSteeringQueue(),
        getFollowUpMessages: () => this.drainFollowUpQueue(),
        // 注入
        toolExecutor,
        stream: this.stream,
        signal,
        emit: (event: AgentEvent) => this.handleLoopEvent(event),
        initialStatus: this.state.status,
      })

      this.transitionTo('completed')
      return result
    } catch (error) {
      if (error instanceof AbortError || signal.aborted) {
        this.transitionTo('aborted')
        throw error
      }

      this.state.error = error instanceof Error ? error : new Error(String(error))
      this.transitionTo('error')
      this.emit('error', this.state.error)
      throw this.state.error
    } finally {
      this.abortController = null
      this.state.isStreaming = false
    }
  }

  // 内部: 同步状态（纯 reducer）
  private syncState(event: AgentEvent): void {
    if (event.type === 'status_change') {
      this.state.status = event.to
      this.state.isStreaming = event.to === 'streaming'
    }

    if (event.type === 'turn_end') {
      this.state.turnCount++
      this.state.currentStreamMessage = null
      const usage = event.message.usage
      this.state.tokenUsage.input += usage.inputTokens
      this.state.tokenUsage.output += usage.outputTokens
      this.state.tokenUsage.cacheRead += usage.cacheReadTokens
    }

    if (event.type === 'stream_event' && event.event.type === 'start') {
      this.state.currentStreamMessage = event.event.partial
    }
  }

  // 内部: 处理循环事件 = 同步状态 + 向外转发
  private handleLoopEvent(event: AgentEvent): void {
    this.syncState(event)
    this.emit(event.type, event as never)
  }

  private transitionTo(to: AgentStatus): void {
    const from = this.state.status
    if (from === to) return

    const allowed = VALID_TRANSITIONS[from]
    if (!allowed?.has(to)) {
      logger.warn('Invalid state transition: %s → %s (ignored)', from, to)
      return
    }

    this.state.status = to
    this.emit('status_change', { from, to })
  }

  private async drainSteeringQueue(): Promise<AgentMessage[]> {
    const messages = [...this.steeringQueue]
    this.steeringQueue = []
    return messages
  }

  private async drainFollowUpQueue(): Promise<AgentMessage[]> {
    const messages = [...this.followUpQueue]
    this.followUpQueue = []
    return messages
  }
}

// 默认消息转换 — AgentMessage 直接当作 LLM Message
function defaultConvertToLLM(messages: AgentMessage[]) {
  return messages.filter((m) => typeof m === 'object' && m !== null && 'role' in m) as LlmMessage[]
}

// 工厂函数
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config)
}
