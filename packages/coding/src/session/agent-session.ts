import { TypedEventEmitter } from '@vitamin/shared'
import { invariant } from '@vitamin/invariant'
import { createToolHookExecutor } from './hooks'
import { calculate, type AssistantMessage } from '@vitamin/ai'
import type { Agent, AgentMessage } from '@vitamin/agent'
import type { AgentTool } from '@vitamin/agent'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session } from '@vitamin/session'
import type { Message, Model, ThinkingLevel, Usage } from '@vitamin/ai'
import type { Devtools } from '@vitamin/devtools'
import type { Events } from '@vitamin/shared'
import type { Logger } from '@vitamin/shared'
import type { 
  AgentSessionOptions, 
  PromptRefresh, 
  PromptOptions 
} from './types'


interface AgentSessionEvents extends Events {
  session_start: (sessionId: string) => void
  session_end: (sessionId: string) => void
  prompt_start: (sessionId: string, prompt: string) => void
  prompt_end: (sessionId: string) => void
  error: (sessionId: string, error: Error) => void
}

export class AgentSession extends TypedEventEmitter<AgentSessionEvents> {
  readonly session: Session<AgentMessage>
  readonly workspaceDir: string

  private agent: Agent
  private disposed = false

  public model: Model
  public tools: AgentTool[]
  public systemPrompt: string
  public agentName: string
  public maxToolTurns: number
  public thinkingLevel: ThinkingLevel
  public promptRefresh: PromptRefresh

  private logger: Logger
  private devtools?: Devtools
  private hookRegistry: HookRegistry

  public get id(): string {
    return this.session.id
  }

  get status(): string {
    return this.agent.status
  }

  get isExecuting(): boolean {
    return this.agent.status === 'streaming' || this.agent.status === 'tool_executing'
  }

  constructor(
    session: Session<AgentMessage>,
    agent: Agent,
    options: AgentSessionOptions,
  ) {
    super()
    this.session = session
    this.agent = agent

    const {
      model,
      systemPrompt,
      tools,
      thinkingLevel,
      maxToolTurns,
      hookRegistry,
      workspaceDir,
      devtools,
      logger,
      promptRefresh
    } = options

    this.model = model
    this.tools = tools ?? []
    this.systemPrompt = systemPrompt
    this.thinkingLevel = thinkingLevel ?? 'medium'
    this.maxToolTurns = maxToolTurns ?? 25
    this.hookRegistry = hookRegistry
    this.agentName = 'TODO' // TODO: agentName 应该从 options 传入，目前先 hardcode
    this.devtools = devtools
    this.logger = logger
    this.workspaceDir = workspaceDir
    this.promptRefresh = promptRefresh

    this.emit('session_start', this.id)
    this.logger.info('Session %s initialized with model %s', this.id, this.model.id)
  }

  async prompt(
    text: string,
    options?: PromptOptions,
  ): Promise<void> {
    this.ensureNotDisposed()
    
    if (this.isExecuting) {
      const { streamingBehavior } = options ?? {}
      if (streamingBehavior === 'followUp') {
        this.followUp(text)
      } else if (streamingBehavior === 'steer') {
        this.steer(text)
      } else {
        throw new Error('Agent is processing. Specify streamingBehavior ("steer" or "followUp") to queue the message.')
      }
    } else {
      this.emit('prompt_start', this.id, text)
      this.logger.info('Session %s prompt started', this.id)

      if (this.promptRefresh) {
        const refreshed = await this.promptRefresh()
        if (refreshed !== undefined) {
          this.systemPrompt = refreshed
        }
      }
    }

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

    await this.hookRegistry.execute('chat.message.before', beforeInput, beforeOutput)

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

    this.logger.info(
      'Session %s context built with %d message(s)%s',
      this.id,
      ctx.messages.length,
      ctx.summary ? ' and summary' : '',
    )

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

    await this.hookRegistry.execute('chat.params', {
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
        void this.hookRegistry.emit('stream.start', { sessionId: this.id, model: this.model.id })
      } else if (se.type === 'done') {
        void this.hookRegistry.emit('stream.end', { sessionId: this.id, model: this.model.id, stopReason: se.reason ?? 'end_turn' })
      }
    })

    try {
      // system-prompt.transform hook: 允许 hook 链式修改 systemPrompt
      const promptTransformOutput = { systemPrompt: this.systemPrompt }

      await this.hookRegistry.execute('system-prompt.transform', {
        systemPrompt: this.systemPrompt,
        sessionId: this.id,
        tools: this.tools,
      }, promptTransformOutput)

      const effectiveSystemPrompt = promptTransformOutput.systemPrompt

      // 3. agent.run() — workLoop 就地修改 messages
      await this.agent.run({
        model: this.model,
        systemPrompt: effectiveSystemPrompt,
        tools: this.tools,
        logger: this.logger,
        maxToolTurns: this.maxToolTurns,
        messages,
        thinkingLevel: paramsOutput.thinkingLevel as ThinkingLevel | undefined,
        temperature: paramsOutput.temperature,
        maxTokens: paramsOutput.maxTokens,
        transformContext: async (contextMessages, signal) => {
          if (signal?.aborted) {
            return contextMessages
          }

          const output = { messages: contextMessages }

          await this.hookRegistry.execute('messages.transform', {
            messages: contextMessages,
            tools: this.tools,
            agentName: this.agentName,
            sessionId: this.id,
          }, output)

          return output.messages
        },
        toolHookExecutor: createToolHookExecutor({
          hookRegistry: this.hookRegistry,
          agentName: this.agentName,
          sessionId: this.id,
        }),
        agentName: this.agentName,
        sessionId: this.id,
        devtools: this.devtools,
      })

      // 4. 将 workLoop 追加的新消息持久化回 Session
      this.persistNewMessages(messages, messagesBefore)
      this.promptUsage(messages.slice(messagesBefore))

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

      await this.hookRegistry.execute('chat.message.after', beforeInput, {
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
      this.logger.info('Session %s prompt finished', this.id)
    } catch (error) {
      this.persistNewMessages(messages, messagesBefore)
      const err = error instanceof Error ? error : new Error(String(error))

      await this.hookRegistry.emit('session.error', {
        sessionId: this.id,
        metadata: {},
        error: err,
      })

      this.emit('error', this.id, err)
      this.logger.error('Session %s prompt failed: %s', this.id, err.message)
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

    this.agent.followUp({
      role: 'user',
      timestamp: Date.now(),
      content: [{ type: 'text', text }],
    })
  }

  abort(): void {
    this.agent.abort()
  }

  async compact(summary: string, compactedCount: number): Promise<void> {
    this.ensureNotDisposed()

    const messageCount = this.session.messages().length

    await this.hookRegistry.emit('compaction.before', { 
      sessionId: this.id, 
      messageCount 
    })

    this.logger.info('Session %s compacting %d message(s)', this.id, compactedCount)

    this.session.compact(summary, compactedCount)

    const retainedCount = this.session.messages().length

    await this.hookRegistry.emit('compaction.after', { 
      sessionId: this.id, 
      retainedCount 
    })

    this.logger.info('Session %s compaction finished, retained %d message(s)', this.id, retainedCount)
  }

  private persistNewMessages(messages: AgentMessage[], startIndex: number): void {
    const newMessages = messages.slice(startIndex)
    for (const msg of newMessages) {
      this.session.append(msg)
    }
  }

  private promptUsage(newMessages: AgentMessage[]): void {
    const usage = this.collectUsage(newMessages)
    if (!usage) {
      return
    }

    const cost = calculate(this.model, usage)
    this.logger.info(
      'Session %s usage input=%d output=%d cacheRead=%d cacheWrite=%d estimatedCost=$%s',
      this.id,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      cost.total.toFixed(6),
    )
  }

  private collectUsage(messages: AgentMessage[]): Usage | null {
    let foundAssistant = false
    const usage: Usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }

    for (const message of messages) {
      if (!this.isAssistantMessage(message)) {
        continue
      }

      foundAssistant = true
      usage.inputTokens += message.usage.inputTokens
      usage.outputTokens += message.usage.outputTokens
      usage.cacheReadTokens += message.usage.cacheReadTokens
      usage.cacheWriteTokens += message.usage.cacheWriteTokens
    }

    return foundAssistant ? usage : null
  }

  private isAssistantMessage(message: AgentMessage): message is AssistantMessage {
    return typeof message === 'object' && message !== null && 'role' in message && message.role === 'assistant'
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`AgentSession ${this.id} has been disposed`)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.agent.abort()

    this.emit('session_end', this.id)
    this.logger.info('Session %s disposed', this.id)
  }
}