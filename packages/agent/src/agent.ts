// Agent 核心类 — 状态机 + steering/followUp 队列
import { createLogger, TypedEventEmitter } from '@vitamin/shared'

import { agentLoop } from './agent-loop'
import { AbortError } from './errors'
import { createToolExecutor } from './tool-executor'

import type { AssistantMessage, Message as LlmMessage, Model, ThinkingLevel } from '@vitamin/ai'
import type { StreamFunction } from './agent-loop'
import type {
  AgentConfig,
  AgentEvent,
  AgentEventListener,
  AgentLoopConfig,
  AgentMessage,
  AgentState,
  AgentStatus,
  AgentTool,
} from './types'

const log = createLogger('agent:core')

// Agent 事件映射
type AgentEvents = {
  [key: string]: (...args: never[]) => void
  event: (event: AgentEvent) => void
}

// Agent 状态合法转换表
const VALID_TRANSITIONS: Record<AgentStatus, Set<AgentStatus>> = {
  idle: new Set(['streaming', 'aborted', 'error']),
  streaming: new Set(['tool_executing', 'completed', 'aborted', 'error']),
  tool_executing: new Set(['streaming', 'aborted', 'error']),
  completed: new Set(['streaming', 'idle', 'aborted', 'error']),
  error: new Set(['idle', 'aborted']),
  aborted: new Set(['streaming', 'idle', 'error']),
}

export class Agent {
  private readonly emitter = new TypedEventEmitter<AgentEvents>()
  private state: AgentState
  private abortController: AbortController | null = null
  private steeringQueue: AgentMessage[] = []
  private followUpQueue: AgentMessage[] = []
  private readonly stream: StreamFunction | undefined

  constructor(config: AgentConfig) {
    this.stream = config.stream as StreamFunction | undefined
    this.state = {
      status: 'idle',
      systemPrompt: config.systemPrompt,
      model: config.model,
      thinkingLevel: config.thinkingLevel,
      tools: config.tools ?? [],
      messages: [],
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

  get status(): AgentStatus {
    return this.state.status
  }

  get model(): Model {
    return this.state.model
  }

  get messages(): readonly AgentMessage[] {
    return this.state.messages
  }

  get turnCount(): number {
    return this.state.turnCount
  }

  // 注册工具
  registerTools(tools: AgentTool[]): void {
    this.state.tools = [...this.state.tools, ...tools]
  }

  // 清除工具
  clearTools(): void {
    this.state.tools = []
  }

  // 更新模型
  setModel(model: Model): void {
    this.state.model = model
  }

  // 更新系统提示
  setSystemPrompt(prompt: string): void {
    this.state.systemPrompt = prompt
  }

  // 更新思考级别
  setThinkingLevel(level: ThinkingLevel): void {
    this.state.thinkingLevel = level
  }

  // 发起对话 — 进入 Agent 循环
  async prompt(
    userMessage: AgentMessage,
    loopConfig?: Partial<AgentLoopConfig>,
  ): Promise<AssistantMessage> {
    if (this.state.status !== 'idle' && this.state.status !== 'completed') {
      throw new Error(`Cannot prompt in ${this.state.status} status`)
    }

    this.state.messages.push(userMessage)
    return this.runLoop(loopConfig)
  }

  // 从中止/完成状态继续运行
  async continue(loopConfig?: Partial<AgentLoopConfig>): Promise<AssistantMessage> {
    if (this.state.status !== 'aborted' && this.state.status !== 'completed') {
      throw new Error(`Cannot continue in ${this.state.status} status`)
    }
    return this.runLoop(loopConfig)
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
    this.transition('aborted')
    this.emit({ type: 'abort' })
  }

  // 重置为 idle
  reset(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.steeringQueue = []
    this.followUpQueue = []
    this.state.messages = []
    this.state.turnCount = 0
    this.state.tokenUsage = { input: 0, output: 0, cacheRead: 0 }
    this.state.currentStreamMessage = null
    this.state.pendingToolCalls = new Set()
    this.state.error = undefined
    this.state.status = 'idle'
  }

  // 订阅事件
  on(listener: AgentEventListener): () => void {
    return this.emitter.on('event', listener)
  }

  // 单次订阅
  once(listener: AgentEventListener): () => void {
    return this.emitter.once('event', listener)
  }

  // 内部: 运行 Agent 循环
  private async runLoop(loopConfigOverride?: Partial<AgentLoopConfig>): Promise<AssistantMessage> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // 组装完整 loopConfig
    const loopConfig: AgentLoopConfig = {
      model: this.state.model,
      systemPrompt: this.state.systemPrompt,
      convertToLlm: loopConfigOverride?.convertToLlm ?? defaultConvertToLlm,
      transformContext: loopConfigOverride?.transformContext,
      getSteeringMessages: () => this.drainSteeringQueue(),
      getFollowUpMessages: () => this.drainFollowUpQueue(),
      getApiKey: loopConfigOverride?.getApiKey,
      maxToolTurns: loopConfigOverride?.maxToolTurns ?? 25,
      thinkingLevel: this.state.thinkingLevel ?? loopConfigOverride?.thinkingLevel,
      maxTokens: loopConfigOverride?.maxTokens,
      temperature: loopConfigOverride?.temperature,
    }

    const toolExecutor = createToolExecutor(this.state.tools)

    // 构建 stream — 优先使用外部注入，否则使用默认
    const stream: StreamFunction = this.stream ?? createDefaultStream()

    try {
      const result = await agentLoop({
        messages: this.state.messages,
        config: loopConfig,
        toolExecutor,
        stream,
        signal,
        initialStatus: this.state.status,
        emit: (event: AgentEvent) => this.handleLoopEvent(event),
      })

      this.transition('completed')
      return result
    } catch (error) {
      if (error instanceof AbortError || signal.aborted) {
        this.transition('aborted')
        throw error
      }

      this.state.error = error instanceof Error ? error : new Error(String(error))
      this.transition('error')
      this.emit({ type: 'error', error: this.state.error })
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
    this.emit(event)
  }

  // 内部: 状态转换（含验证）
  private transition(to: AgentStatus): void {
    const from = this.state.status
    if (from === to) return

    const allowed = VALID_TRANSITIONS[from]
    if (!allowed?.has(to)) {
      // 非法转换时记录警告但不抛出，避免中断循环
      log.warn('Invalid state transition: %s → %s (ignored)', from, to)
      return
    }

    this.state.status = to
    this.emit({ type: 'status_change', from, to })
  }

  // 内部: 发射事件
  private emit(event: AgentEvent): void {
    this.emitter.emit('event', event)
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
function defaultConvertToLlm(messages: AgentMessage[]) {
  // 简单过滤出 LLM 兼容的消息
  return messages.filter((m) => typeof m === 'object' && m !== null && 'role' in m) as LlmMessage[]
}

// 默认 streamFn — 抛错提示需要注入
function createDefaultStream(): StreamFunction {
  return () => {
    throw new Error('No stream funcntion provided. Pass a stream in AgentConfig or use createAgent with a ProviderRegistry.')
  }
}

// 工厂函数
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config)
}
