import { 
  createLogger, 
  TypedEventEmitter 
} from '@vitamin/shared'

import { workLoop } from './work-loop'
import { AbortError } from './errors'
import { createToolExecutor } from './tool-executor'

import type { AssistantMessage, Message as LlmMessage } from '@vitamin/ai'
import type { StreamFunction } from './work-loop'
import type {
  AgentConfig,
  AgentEvent,
  AgentLoopContext,
  AgentMessage,
  AgentRunContext,
  AgentState,
  AgentStatus,
} from './types'

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
type AgentEvents = {
  [key: string]: (...args: unknown[]) => void
}

export class Agent extends TypedEventEmitter<AgentEvents> {
  private state: AgentState
  private abortController: AbortController | null = null
  private steeringQueue: AgentMessage[] = []
  private followUpQueue: AgentMessage[] = []
  private readonly stream: StreamFunction | undefined

  get status(): AgentStatus {
    return this.state.status
  }

  get turnCount(): number {
    return this.state.turnCount
  }

  constructor(config: AgentConfig = {}) {
    super()

    this.stream = config.stream as StreamFunction | undefined
    this.state = {
      status: 'idle',
      turnCount: 0,
      tokenUsage: { input: 0, output: 0, cacheRead: 0 },
      isStreaming: false,
      currentStreamMessage: null,
      pendingToolCalls: new Set(),
      error: undefined,
    }
  }

  // 获取当前状态快照
  getState(): Readonly<AgentState> {
    return { ...this.state }
  }

  ///
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

  // Steering 注入（工具间隙检查）
  steer(message: AgentMessage): void {
    this.steeringQueue.push(message)
  }

  // FollowUp 注入（外循环检查）
  followUp(message: AgentMessage): void {
    this.followUpQueue.push(message)
  }

  // 中止运行
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }

    this.transitionTo('aborted')
    this.emit('aborted')
  }

  // 重置为 idle
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
    this.state.pendingToolCalls = new Set()
    this.state.error = undefined
    this.state.status = 'idle'
  }

  // 内部: 运行 Agent 循环
  private async runLoop(context: AgentRunContext): Promise<AssistantMessage> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // 组装完整 runtime
    const runtime: AgentLoopContext = {
      model: context.model,
      systemPrompt: context.systemPrompt,
      logger: context.logger,
      convertToLLM: context.convertToLLM ?? defaultConvertToLLM,
      transformContext: context.transformContext,
      getSteeringMessages: () => this.drainSteeringQueue(),
      getFollowUpMessages: () => this.drainFollowUpQueue(),
      maxToolTurns: context.maxToolTurns ?? 25,
      thinkingLevel: context.thinkingLevel,
      maxTokens: context.maxTokens,
      temperature: context.temperature,
      devtools: context.devtools,
    }

    const toolExecutor = createToolExecutor(context.tools, {
      hookExecutor: context.toolHookExecutor,
      agentName: context.agentName,
      sessionId: context.sessionId,
      devtools: context.devtools,
    })

    // 构建 stream — 优先使用外部注入，否则使用默认
    const stream: StreamFunction = this.stream ?? createDefaultStream()

    try {
      const result = await workLoop({
        ...runtime,
        messages: context.messages,
        toolExecutor,
        stream,
        signal,
        initialStatus: this.state.status,
        emit: (event: AgentEvent) => this.handleLoopEvent(event),
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

  // 内部: 处理循环事件
  private handleLoopEvent(event: AgentEvent): void {
    // 同步状态
    if (event.type === 'status_change') {
      this.state.status = event.to
      if (event.to === 'streaming') {
        this.state.isStreaming = true
      } else {
        this.state.isStreaming = false
      }
    }

    if (event.type === 'turn_end') {
      this.state.turnCount++
      this.state.currentStreamMessage = null
      // 累计 token 使用量
      const usage = event.message.usage
      this.state.tokenUsage.input += usage.inputTokens
      this.state.tokenUsage.output += usage.outputTokens
      this.state.tokenUsage.cacheRead += usage.cacheReadTokens
    }

    if (event.type === 'stream_event' && event.event.type === 'start') {
      this.state.currentStreamMessage = event.event.partial
    }

    // 转发事件给外部订阅者
    this.emit(event.type, event)
  }

  // 内部: 状态转换（含验证）
  private transitionTo(to: AgentStatus): void {
    const from = this.state.status
    if (from === to) return

    const allowed = VALID_TRANSITIONS[from]
    if (!allowed?.has(to)) {
      // 非法转换时记录警告但不抛出，避免中断循环
      logger.warn('Invalid state transition: %s → %s (ignored)', from, to)
      return
    }

    this.state.status = to
    this.emit('status_change', { from, to })
  }

  // 内部: 排空 steering 队列
  private async drainSteeringQueue(): Promise<AgentMessage[]> {
    const messages = [...this.steeringQueue]
    this.steeringQueue = []
    return messages
  }

  // 内部: 排空 followUp 队列
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

// 默认 stream — 抛错提示需要注入
function createDefaultStream(): StreamFunction {
  return () => {
    throw new Error('No stream function provided. Pass a stream in AgentConfig or via AgentRunContext.')
  }
}

// 工厂函数
export function createAgent(config: AgentConfig = {}): Agent {
  return new Agent(config)
}
