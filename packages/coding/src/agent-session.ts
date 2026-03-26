import { TypedEventEmitter } from '@vitamin/shared'
import { invariant } from '@vitamin/invariant'
import { createToolHookExecutor } from './hooks'
import type { Agent, AgentMessage } from '@vitamin/agent'
import type { AgentTool } from '@vitamin/agent'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session } from '@vitamin/session'
import type { Message, Model, ThinkingLevel } from '@vitamin/ai'
import type { Devtools } from '@vitamin/devtools'
import type { PromptOptions } from './types'
import type { Events } from '@vitamin/shared'



export interface AgentSessionConfig {
  model: Model
  systemPrompt: string
  tools?: AgentTool[]
  thinkingLevel?: ThinkingLevel
  hooks: HookRegistry
  agentName?: string
  // 工作目录
  workspaceDir?: string
  // 开发工具
  devtools?: Devtools
}

interface AgentSessionEvents extends Events {
  session_start: (sessionId: string) => void
  session_end: (sessionId: string) => void
  prompt_start: (sessionId: string, prompt: string) => void
  prompt_end: (sessionId: string) => void
  error: (sessionId: string, error: Error) => void
  // 可扩展更多事件，如 tool_call_start, tool_call_end 等
}

export class AgentSession extends TypedEventEmitter<AgentSessionEvents> {
  readonly id: string
  readonly session: Session<AgentMessage>
  readonly workspaceDir?: string

  private agent: Agent
  private disposed = false

  // Session 级别的运行时配置
  private model: Model
  private tools: AgentTool[]
  private systemPrompt: string
  private thinkingLevel?: ThinkingLevel
  private hooks: HookRegistry
  private agentName: string
  private devtools?: Devtools

  constructor(
    session: Session<AgentMessage>,
    agent: Agent,
    config: AgentSessionConfig,
  ) {
    super()
    this.id = session.id
    this.session = session
    this.agent = agent

    this.model = config.model
    this.tools = config.tools ?? []
    this.systemPrompt = config.systemPrompt
    this.thinkingLevel = config.thinkingLevel
    this.hooks = config.hooks
    this.agentName = config.agentName ?? 'primary'
    this.workspaceDir = config.workspaceDir
    this.devtools = config.devtools

    this.emit('session_start', this.id)
  }

  get status(): string {
    return this.agent.status
  }

  /// 发起对话 — Session 是唯一的数据源。
  // 流程:
  // 1. 用户消息 → 追加到 Session
  // 2. Session.buildContext() → 构建上下文（含压缩摘要）
  // 3. agent.run(context) → workLoop 就地修改 messages 数组
  // 4. 新产生的消息 → 追加回 Session
  async prompt(
    text: string,
    options?: PromptOptions,
  ): Promise<void> {
    this.ensureNotDisposed()

    // 如果正在处理，按 streamingBehavior 排队
    if (
      this.agent.status === 'streaming' || 
      this.agent.status === 'tool_executing'
    ) {
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

    this.emit('prompt_start', this.id, text)

    invariant(() => {
      this.devtools?.debugger.pause({
        turn: 0,
        point: 'prompt_before',
        frameDepth: 0,
        messagesCount: this.session.messages().length,
        metadata: { sessionId: this.id, isFirstMessage: this.session.messages().length === 0 },
      })
      return true
    }, `Prompt before: ${this.id}`)

    const isFirstMessage = this.session.messages().length === 0

    const beforeInput = {
      message: {
        role: 'user' as const,
        timestamp: Date.now(),
        content: [{ type: 'text' as const, text }],
      },
      sessionId: this.id,
      isFirstMessage,
      metadata: {},
    }

    const beforeOutput = {
      message: beforeInput.message,
      cancelled: false,
      metadata: {},
    }

    await this.hooks.execute('chat.message.before', beforeInput, beforeOutput)

    if (beforeOutput.cancelled) {
      this.emit('prompt_end', this.id)
      return
    }

    // 1. 构建用户消息 → 持久化到 Session
    const message = beforeOutput.message as Message
    this.session.append(message)

    // 2. 从 Session 构建上下文
    const ctx = this.session.buildContext()
    const messages: AgentMessage[] = []

    if (ctx.summary) {
      messages.push({
        role: 'user',
        timestamp: Date.now(),
        content: [{ type: 'text', text: `[Previous conversation summary]\n${ctx.summary}` }],
      } as Message)
    }

    messages.push(...ctx.messages)
    const messagesBefore = messages.length

    invariant(() => {
      this.devtools?.debugger.pause({
        turn: 0,
        point: 'context_build',
        frameDepth: 0,
        messagesCount: messagesBefore,
        metadata: { sessionId: this.id, hasSummary: !!ctx.summary },
      })
      return true
    }, `Context built: ${messagesBefore} messages`)

    const paramsOutput = {
      temperature: undefined as number | undefined,
      maxTokens: undefined as number | undefined,
      thinkingLevel: this.thinkingLevel,
      metadata: {},
    }

    await this.hooks.execute('chat.params', {
      sessionId: this.id,
      model: this.model.id,
      provider: this.model.provider,
      thinkingLevel: this.thinkingLevel,
    }, paramsOutput)

    // 订阅 Agent 流事件，桥接到 stream.start / stream.end hooks
    const unsubStream = this.agent.on('stream_event', (...args: unknown[]) => {
      const event = args[0] as { type: string; event: { type: string; reason?: string } }
      const se = event.event
      if (se.type === 'start') {
        void this.hooks.emit('stream.start', { sessionId: this.id, model: this.model.id })
      } else if (se.type === 'done') {
        void this.hooks.emit('stream.end', { sessionId: this.id, model: this.model.id, stopReason: se.reason ?? 'end_turn' })
      }
    })

    try {
      // 3. agent.run() — workLoop 就地修改 messages
      await this.agent.run({
        model: this.model,
        systemPrompt: this.systemPrompt,
        tools: this.tools,
        messages,
        thinkingLevel: paramsOutput.thinkingLevel as ThinkingLevel | undefined,
        temperature: paramsOutput.temperature,
        maxTokens: paramsOutput.maxTokens,
        transformContext: async (contextMessages, signal) => {
          if (signal?.aborted) {
            return contextMessages
          }

          const output = { messages: contextMessages }
          await this.hooks.execute('messages.transform', {
            messages: contextMessages,
            tools: this.tools,
            agentName: this.agentName,
            sessionId: this.id,
          }, output)
          return output.messages
        },
        toolHookExecutor: createToolHookExecutor({
          hooks: this.hooks,
          agentName: this.agentName,
          sessionId: this.id,
        }),
        agentName: this.agentName,
        sessionId: this.id,
        devtools: this.devtools,
      })

      // 4. 将 workLoop 追加的新消息持久化回 Session
      this.persistNewMessages(messages, messagesBefore)

      invariant(() => {
        this.devtools?.debugger.pause({
          turn: 0,
          point: 'messages_persist',
          frameDepth: 0,
          messagesCount: messages.length,
          metadata: { sessionId: this.id, newMessages: messages.length - messagesBefore },
        })
        return true
      }, `Messages persisted: ${messages.length - messagesBefore} new`)

      await this.hooks.execute('chat.message.after', beforeInput, {
        message: beforeOutput.message,
        cancelled: false,
        metadata: {},
      })

      invariant(() => {
        this.devtools?.debugger.pause({
          turn: 0,
          point: 'prompt_after',
          frameDepth: 0,
          messagesCount: messages.length,
          metadata: { sessionId: this.id },
        })
        return true
      }, `Prompt after: ${this.id}`)

      this.emit('prompt_end', this.id)
    } catch (error) {
      // 即使出错也持久化中间消息
      this.persistNewMessages(messages, messagesBefore)
      const err = error instanceof Error ? error : new Error(String(error))
      await this.hooks.emit('session.error', {
        sessionId: this.id,
        metadata: {},
        error: err,
      })
      this.emit('error', this.id, err)
      throw error
    } finally {
      unsubStream()
    }
  }

  steer(text: string): void {
    this.ensureNotDisposed()

    const message: Message = {
      role: 'user',
      timestamp: Date.now(),
      content: [{ type: 'text', text }],
    }

    this.agent.steer(message)
  }

  followUp(text: string): void {
    this.ensureNotDisposed()

    const message: Message = {
      role: 'user',
      timestamp: Date.now(),
      content: [{ type: 'text', text }],
    }

    this.agent.followUp(message)
  }

  abort(): void {
    this.agent.abort()
  }

  async compact(summary: string, compactedCount: number): Promise<void> {
    this.ensureNotDisposed()

    const messageCount = this.session.messages().length
    await this.hooks.emit('compaction.before', { sessionId: this.id, messageCount })

    this.session.compact(summary, compactedCount)

    const retainedCount = this.session.messages().length
    await this.hooks.emit('compaction.after', { sessionId: this.id, retainedCount })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    this.agent.abort()
    this.emit('session_end', this.id)
  }

  private persistNewMessages(messages: AgentMessage[], startIndex: number): void {
    const newMessages = messages.slice(startIndex)
    for (const msg of newMessages) {
      this.session.append(msg)
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`AgentSession ${this.id} has been disposed`)
    }
  }
}