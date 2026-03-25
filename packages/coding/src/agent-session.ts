import type { Agent, AgentEventListener, AgentMessage } from '@vitamin/agent'
import type { AgentTool } from '@vitamin/agent'
import type { Session } from '@vitamin/session'
import type { Message, Model, ThinkingLevel } from '@vitamin/ai'
import type {
  AgentSession as IAgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  PromptOptions,
} from './types'


export interface AgentSessionConfig {
  model: Model
  systemPrompt: string
  tools?: AgentTool[]
  thinkingLevel?: ThinkingLevel
}

export class AgentSession implements IAgentSession {
  readonly id: string
  readonly session: Session<AgentMessage>

  private agent: Agent
  private agentUnsubscribe: (() => void) | null = null
  private sessionEventListeners: AgentSessionEventListener[] = []
  private disposed = false

  // Session 级别的运行时配置
  private model: Model
  private systemPrompt: string
  private tools: AgentTool[]
  private thinkingLevel?: ThinkingLevel

  constructor(
    session: Session<AgentMessage>,
    agent: Agent,
    config: AgentSessionConfig,
  ) {
    this.id = session.id
    this.session = session
    this.agent = agent

    this.model = config.model
    this.systemPrompt = config.systemPrompt
    this.tools = config.tools ?? []
    this.thinkingLevel = config.thinkingLevel

    // 监听 Agent 事件
    this.agentUnsubscribe = this.agent.on((event) => {
      this.handleAgentEvent(event)
    })

    this.emitSessionEvent({ type: 'session_start', sessionId: this.id })
  }

  get status(): string {
    return this.agent.status
  }

  /**
   * 发起对话 — Session 是唯一的数据源。
   *
   * 流程:
   * 1. 用户消息 → 追加到 Session
   * 2. Session.buildContext() → 构建上下文（含压缩摘要）
   * 3. agent.run(context) → workLoop 就地修改 messages 数组
   * 4. 新产生的消息 → 追加回 Session
   */
  async prompt(
    text: string,
    options?: PromptOptions,
  ): Promise<void> {
    this.ensureNotDisposed()

    // 如果正在处理，按 streamingBehavior 排队
    if (this.agent.status === 'streaming' || this.agent.status === 'tool_executing') {
      if (options?.streamingBehavior === 'followUp') {
        this.followUp(text)
        return
      } else if (options?.streamingBehavior === 'steer') {
        this.steer(text)
        return
      } else {
        throw new Error('Agent is processing. Specify streamingBehavior ("steer" or "followUp") to queue the message.')
      }
    }

    this.emitSessionEvent({ type: 'prompt_start', sessionId: this.id, text })

    // 1. 构建用户消息 → 持久化到 Session
    const userMessage: Message = {
      role: 'user',
      content: [{ type: 'text', text }],
    }
    this.session.append(userMessage)

    // 2. 从 Session 构建上下文
    const ctx = this.session.buildContext()
    const messages: AgentMessage[] = []

    if (ctx.summary) {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: `[Previous conversation summary]\n${ctx.summary}` }],
      } as Message)
    }

    messages.push(...ctx.messages)

    const messagesBefore = messages.length

    try {
      // 3. agent.run() — workLoop 就地修改 messages
      await this.agent.run({
        model: this.model,
        systemPrompt: this.systemPrompt,
        tools: this.tools,
        messages,
        thinkingLevel: this.thinkingLevel,
      })

      // 4. 将 workLoop 追加的新消息持久化回 Session
      this.persistNewMessages(messages, messagesBefore)

      this.emitSessionEvent({ type: 'prompt_end', sessionId: this.id })
    } catch (error) {
      // 即使出错也持久化中间消息
      this.persistNewMessages(messages, messagesBefore)

      this.emitSessionEvent({
        type: 'error',
        sessionId: this.id,
        error: error instanceof Error ? error : new Error(String(error)),
      })
      throw error
    }
  }

  steer(text: string): void {
    this.ensureNotDisposed()
    const message: Message = {
      role: 'user',
      content: [{ type: 'text', text }],
    }
    this.agent.steer(message)
  }

  followUp(text: string): void {
    this.ensureNotDisposed()
    const message: Message = {
      role: 'user',
      content: [{ type: 'text', text }],
    }
    this.agent.followUp(message)
  }

  onAgentEvent(listener: AgentEventListener): () => void {
    return this.agent.on(listener)
  }

  onSessionEvent(listener: AgentSessionEventListener): () => void {
    this.sessionEventListeners.push(listener)
    return () => {
      const index = this.sessionEventListeners.indexOf(listener)
      if (index !== -1) {
        this.sessionEventListeners.splice(index, 1)
      }
    }
  }

  abort(): void {
    this.agent.abort()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    this.agent.abort()
    if (this.agentUnsubscribe) {
      this.agentUnsubscribe()
      this.agentUnsubscribe = null
    }
    this.sessionEventListeners = []
    this.emitSessionEvent({ type: 'session_end', sessionId: this.id })
  }

  // ──── 内部方法 ────

  private persistNewMessages(messages: AgentMessage[], startIndex: number): void {
    const newMessages = messages.slice(startIndex)
    for (const msg of newMessages) {
      this.session.append(msg)
    }
  }

  private handleAgentEvent(_event: import('@vitamin/agent').AgentEvent): void {
    // 细粒度事件处理可在此扩展
  }

  private emitSessionEvent(event: AgentSessionEvent): void {
    for (const listener of this.sessionEventListeners) {
      listener(event)
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`AgentSession ${this.id} has been disposed`)
    }
  }
}