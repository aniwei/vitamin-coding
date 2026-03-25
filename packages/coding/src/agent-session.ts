import { Agent } from '@vitamin/agent'
import { createAgent } from '@vitamin/agent'
import type { AgentEventListener, AgentMessage } from '@vitamin/agent'
import type { Session } from '@vitamin/session'
import type { AssistantMessage, Message } from '@vitamin/ai'
import type {
  AgentSession as IAgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionOptions,
  PromptOptions,
} from './types'


export class AgentSession implements IAgentSession {
  readonly id: string
  readonly session: Session

  private agent: Agent
  private agentUnsubscribe: (() => void) | null = null
  private sessionEventListeners: AgentSessionEventListener[] = []
  private disposed = false

  constructor(
    session: Session,
    agent: Agent,
  ) {
    this.id = session.id
    this.session = session
    this.agent = agent

    // 监听 Agent 事件，自动持久化消息到 Session
    this.agentUnsubscribe = this.agent.on((event) => {
      this.handleAgentEvent(event)
    })

    this.emitSessionEvent({ type: 'session_start', sessionId: this.id })
  }

  get status(): string {
    return this.agent.status
  }

  async prompt(
    text: string, 
    options?: PromptOptions
  ): Promise<void> {
    this.ensureNotDisposed()

    // 如果正在流式处理，按 streamingBehavior 排队
    if (this.agent.status === 'streaming' || this.agent.status === 'tool_executing') {
      if (options?.streamingBehavior === 'followUp') {
        this.followUp(text)
      } else if (options?.streamingBehavior === 'steer') {
        this.steer(text)
      } else {
        throw new Error('Agent is processing. Specify streamingBehavior ("steer" or "followUp") to queue the message.')
      }
    }

    this.emitSessionEvent({ type: 'prompt_start', sessionId: this.id, text })

    // 持久化用户消息
    this.session.appendUserMessage(text)
    this.emitSessionEvent({ type: 'message_persisted', sessionId: this.id, role: 'user' })

    const userMessage: Message = {
      role: 'user',
      content: [{ type: 'text', text }],
    }

    try {
      const result = await this.agent.prompt(userMessage)

      // 持久化助手回复
      const assistantText = this.extractAssistantText(result)
      if (assistantText) {
        this.session.appendAssistantMessage(assistantText)
        this.emitSessionEvent({ type: 'message_persisted', sessionId: this.id, role: 'assistant' })
      }

      this.emitSessionEvent({ type: 'prompt_end', sessionId: this.id })
    } catch (error) {
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

  private handleAgentEvent(event: import('@vitamin/agent').AgentEvent): void {
    // 工具调用结果等细粒度事件可在此扩展持久化逻辑
    // 当前保持简洁：仅在 prompt() 层面持久化 user/assistant 消息
  }

  private emitSessionEvent(event: AgentSessionEvent): void {
    for (const listener of this.sessionEventListeners) {
      listener(event)
    }
  }

  private extractAssistantText(message: AssistantMessage): string {
    const parts: string[] = []
    for (const block of message.content) {
      if (block.type === 'text') {
        parts.push(block.text)
      }
    }
    return parts.join('')
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`AgentSession ${this.id} has been disposed`)
    }
  }
}