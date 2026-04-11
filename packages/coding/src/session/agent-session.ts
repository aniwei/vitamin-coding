import { randomUUID } from 'node:crypto'
import { Subscription, type Events } from '@vitamin/shared'
import { createToolHookExecutor } from './hooks'
import { calculate, type AssistantMessage } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { createLogger, type Logger } from '@vitamin/shared'
import {
  createAgent,
  type Agent,
  type AgentMessage,
  type AgentTool,
  type ToolCallEvent,
  type ToolResult,
} from '@vitamin/agent'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session } from '@vitamin/session'
import type {
  Message,
  Model,
  StreamEvent,
  ThinkingLevel,
  Usage
} from '@vitamin/ai'
import type {
  Devtools,
  PauseResult,
  DebugSnapshot,
  MessageSummaryItem,
} from '@vitamin/devtools'
import type {
  AgentSessionOptions,
  AgentSessionEvent,
  AgentSessionSubscriber,
  AskUserQuestion,
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

interface Deferred<T> {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  promise: Promise<T>
}

type SnapshotMetadata = Record<string, string | number | boolean | null>

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { resolve, reject, promise }
}

export class AgentSession extends Subscription<AgentSessionEvents> {
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
  public promptRefresh?: PromptRefresh

  private logger: Logger
  private hookRegistry: HookRegistry
  private devtools?: Devtools

  private pendingApproval: { id: string; deferred: Deferred<boolean> } | null = null
  private pendingAskUser: { requestId: string; deferred: Deferred<Record<string, unknown> | null> } | null = null
  private pendingPlanApproval: { requestId: string; deferred: Deferred<{ action: string; feedback?: string }> } | null = null
  private readonly agentUnsubs: Array<() => void> = []

  get id(): string {
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
    options: AgentSessionOptions,
  ) {
    super()
    this.session = session

    const hookRegistry = options.hookRegistry ?? createHookRegistry({ preset: 'default' })
    const logger = options.logger ?? createLogger(`agent-session:${session.id}`, {
      level: 'info',
      destination: 'stdout',
    })

    const promptRefresh = options.promptRefresh
    const systemPrompt = options.systemPrompt ?? ''
    const tools = options.tools ?? []
    const thinkingLevel = options.thinkingLevel ?? 'medium'
    const maxToolTurns = options.maxToolTurns ?? 25
    const workspaceDir = options.workspaceDir ?? process.cwd()

    const { model, devtools, agentName } = options

    this.model = model
    this.tools = tools
    this.systemPrompt = systemPrompt
    this.thinkingLevel = thinkingLevel
    this.maxToolTurns = maxToolTurns
    this.hookRegistry = hookRegistry
    this.agentName = agentName ?? 'agent'
    this.devtools = devtools
    this.logger = logger
    this.workspaceDir = workspaceDir
    this.promptRefresh = promptRefresh

    // Agent 在 AgentSession 内部创建，持有基础设施配置，跨所有 run() 共享
    this.agent = createAgent({
      stream: options.stream,
      logger,
      maxToolTurns,
      agentName: this.agentName,
      sessionId: session.id,
      toolHookExecutor: createToolHookExecutor({
        hookRegistry,
        agentName: this.agentName,
        sessionId: session.id,
      }),
      devtools,
      approval: (toolName, args, reason) => this.requestApproval(toolName, args, reason),
    })

    this.agentUnsubs.push(this.agent.on('stream_event', this.onStreamEvent))
    this.agentUnsubs.push(this.agent.on('turn_start', this.onTurnStart))
    this.agentUnsubs.push(this.agent.on('tool_call_start', this.onToolCallStart))
    this.agentUnsubs.push(this.agent.on('tool_call_end', this.onToolCallEnd))

    this.emit('session_start', this.id)
    this.logger.info('Session %s initialized with model %s', this.id, this.model.id)
  }

  onStreamEvent = async (event: StreamEvent): Promise<void> => {
    this.publish({ 
      stream_event: [{ 
        type: 'stream_event' as const, 
        sessionId: this.id, 
        event 
      }] 
    })

    if (event.type === 'start') {
      this.publish({ streaming_start: [{ type: 'streaming_start' as const, sessionId: this.id, model: this.model.id }] })

      await this.hookRegistry.emit('stream.start', {
        sessionId: this.id,
        model: this.model.id,
      })
    } else if (event.type === 'done') {
      this.publish({ streaming_end: [{ type: 'streaming_end' as const, sessionId: this.id, model: this.model.id, stopReason: event.reason ?? 'end_turn' }] })

      await this.hookRegistry.emit('stream.end', {
        sessionId: this.id,
        model: this.model.id,
        stopReason: event.reason ?? 'end_turn',
      })
    }
  }

  private onTurnStart = (event: { turnIndex: number }): void => {
    this.publish({
      turn_start: [{ type: 'turn_start' as const, sessionId: this.id, turnIndex: event.turnIndex }],
    })
  }

  private onToolCallStart = (event: { toolCall: ToolCallEvent }): void => {
    this.publish({
      tool_call_start: [{
        type: 'tool_call_start' as const,
        sessionId: this.id,
        toolCall: {
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
        },
      }],
    })
  }

  private onToolCallEnd = (event: { toolCall: ToolCallEvent; result: ToolResult }): void => {
    this.publish({
      tool_call_end: [{
        type: 'tool_call_end' as const,
        sessionId: this.id,
        toolCall: {
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
        },
        isError: event.result.isError === true,
      }],
    })
  }

  async prompt(
    text: string,
    options?: PromptOptions,
  ): Promise<void> {
    this.ensureNotDisposed()

    const overrides: {
      temperature?: number
      maxTokens?: number
      thinkingLevel?: ThinkingLevel
    } = {}

    const consume = (
      result: PauseResult | undefined, 
      messages?: AgentMessage[]
    ): void => {
      if (!result?.payload) {
        return
      }

      const payload = result.payload

      if (payload.systemPrompt !== undefined) {
        this.systemPrompt = payload.systemPrompt
      }

      if (payload.llmParams?.temperature !== undefined) {
        overrides.temperature = payload.llmParams.temperature
      }

      if (payload.llmParams?.maxTokens !== undefined) {
        overrides.maxTokens = payload.llmParams.maxTokens
      }

      const thinkingLevel = payload.llmParams?.thinkingLevel
      if (thinkingLevel && this.isThinkingLevel(thinkingLevel)) {
        overrides.thinkingLevel = thinkingLevel
        this.thinkingLevel = thinkingLevel
      }

      if (!messages) {
        return
      }

      if (payload.removeMessageIndices?.length) {
        const sortedIndices = [...payload.removeMessageIndices].sort((a, b) => b - a)
        for (const idx of sortedIndices) {
          if (idx >= 0 && idx < messages.length) {
            messages.splice(idx, 1)
          }
        }
      }

      if (payload.injectMessages?.length) {
        for (const msg of payload.injectMessages) {
          messages.push({ role: msg.role, content: msg.content } as AgentMessage)
        }
      }
    }

    const pause = (
      point: DebugSnapshot['point'],
      snapshotMessages: readonly AgentMessage[],
      metadata: SnapshotMetadata,
    ) => this.devtools?.debugger.pause({
      turn: 0,
      point,
      frameDepth: 0,
      messagesCount: snapshotMessages.length,
      tokenUsage: { input: 0, output: 0 },
      metadata,
      systemPrompt: this.systemPrompt,
      messagesSummary: summarizeMessages(snapshotMessages, 10),
      llmParams: {
        temperature: overrides.temperature,
        maxTokens: overrides.maxTokens,
        thinkingLevel: overrides.thinkingLevel ?? this.thinkingLevel,
      },
    })
    
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

    const sessionMessagesBeforePrompt = this.session.messages()

    consume(await pause('prompt_before', sessionMessagesBeforePrompt, {
      sessionId: this.id,
      isFirstMessage: sessionMessagesBeforePrompt.length === 0,
    }))

    const isFirstMessage = sessionMessagesBeforePrompt.length === 0

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

    await this.hookRegistry.execute(
      'chat.message.before', 
      beforeInput, 
      beforeOutput
    )

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

    consume(await pause('context_build', messages, {
      sessionId: this.id,
      hasSummary: !!ctx.summary,
    }))

    const messagesBefore = messages.length
    const paramsOutput = {
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens,
      thinkingLevel: overrides.thinkingLevel ?? this.thinkingLevel,
      metadata: {},
    }

    await this.hookRegistry.execute('chat.params', {
      sessionId: this.id,
      model: this.model.id,
      provider: this.model.provider,
      thinkingLevel: this.thinkingLevel,
    }, paramsOutput)

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
        messages,
        thinkingLevel: paramsOutput.thinkingLevel as ThinkingLevel,
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
      })

      // 4. 将 workLoop 追加的新消息持久化回 Session
      this.persistNewMessages(messages, messagesBefore)
      this.promptUsage(messages.slice(messagesBefore))

      
      consume(await pause('messages_persist', messages, {
        sessionId: this.id,
        newMessages: messages.length - messagesBefore,
      }))
      
      await this.hookRegistry.execute('chat.message.after', beforeInput, {
        message: beforeOutput.message,
        cancelled: false,
        metadata: {},
      })

      
      consume(await pause('prompt_after', messages, {
        sessionId: this.id,
      }))

      this.emit('prompt_end', this.id)
      this.logger.info('Session %s prompt finished', this.id)

      // 通知 session 进入空闲状态
      await this.hookRegistry.emit('session.idle', {
        sessionId: this.id,
        metadata: {},
      })
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
    this.rejectPendingGates()
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

  private isThinkingLevel(value: string): value is ThinkingLevel {
    return value === 'minimal'
      || value === 'low'
      || value === 'medium'
      || value === 'high'
      || value === 'xhigh'
  }

  override subscribe(subscriber: AgentSessionSubscriber): () => void
  override subscribe<K extends string>(type: K, callback: (...args: unknown[]) => void, once?: boolean): () => void
  override subscribe(subscriberOrType: AgentSessionSubscriber | string, callback?: (...args: unknown[]) => void, once?: boolean): () => void {
    if (typeof subscriberOrType === 'function') {
      return this.subscribeAll((_type: unknown, event: unknown) => {
        subscriberOrType(event as AgentSessionEvent)
      })
    }
    return super.subscribe(subscriberOrType, callback!, once)
  }

  async requestApproval(
    toolName: string,
    args: Record<string, unknown>,
    description: string,
  ): Promise<boolean> {
    const id = randomUUID()
    const deferred = createDeferred<boolean>()
    this.pendingApproval = { id, deferred }

    this.publish({ approval_required: [{ type: 'approval_required' as const, sessionId: this.id, id, toolName, arguments: args, description }] })

    this.logger.info('Session %s approval requested for tool %s (%s)', this.id, toolName, id)

    try {
      return await deferred.promise
    } finally {
      this.pendingApproval = null
    }
  }

  resolveApproval(approvalId: string, approved: boolean): void {
    if (this.pendingApproval?.id === approvalId) {
      this.pendingApproval.deferred.resolve(approved)
      this.publish({ approval_resolved: [{ type: 'approval_resolved' as const, sessionId: this.id, id: approvalId, approved }] })
      this.logger.info('Session %s approval %s for %s', this.id, approved ? 'granted' : 'denied', approvalId)
    }
  }

  async requestAskUser(questions: AskUserQuestion[]): Promise<Record<string, unknown> | null> {
    const requestId = randomUUID()
    const deferred = createDeferred<Record<string, unknown> | null>()
    this.pendingAskUser = { requestId, deferred }

    this.publish({ ask_user_required: [{ type: 'ask_user_required' as const, sessionId: this.id, requestId, questions }] })

    this.logger.info('Session %s ask-user requested (%s)', this.id, requestId)

    try {
      return await deferred.promise
    } finally {
      this.pendingAskUser = null
    }
  }

  resolveAskUser(requestId: string, answers: Record<string, unknown> | null): void {
    if (this.pendingAskUser?.requestId === requestId) {
      this.pendingAskUser.deferred.resolve(answers)
      this.publish({ ask_user_resolved: [{ type: 'ask_user_resolved' as const, sessionId: this.id, requestId }] })
      this.logger.info('Session %s ask-user resolved for %s', this.id, requestId)
    }
  }

  async requestPlanApproval(planContent: string): Promise<{ action: string; feedback?: string }> {
    const requestId = randomUUID()
    const deferred = createDeferred<{ action: string; feedback?: string }>()
    this.pendingPlanApproval = { requestId, deferred }

    this.publish({ plan_approval_required: [{ type: 'plan_approval_required' as const, sessionId: this.id, requestId, planContent }] })

    this.logger.info('Session %s plan approval requested (%s)', this.id, requestId)

    try {
      return await deferred.promise
    } finally {
      this.pendingPlanApproval = null
    }
  }

  resolvePlanApproval(requestId: string, action: string, feedback?: string): void {
    if (this.pendingPlanApproval?.requestId === requestId) {
      this.pendingPlanApproval.deferred.resolve({ action, feedback })
      this.publish({ plan_approval_resolved: [{ type: 'plan_approval_resolved' as const, sessionId: this.id, requestId, action }] })
      this.logger.info('Session %s plan %s for %s', this.id, action, requestId)
    }
  }

  // ─── Cleanup pending gates on abort ────────────────────────────────

  private rejectPendingGates(): void {
    if (this.pendingApproval) {
      this.pendingApproval.deferred.reject(new Error('Session aborted'))
      this.pendingApproval = null
    }
    if (this.pendingAskUser) {
      this.pendingAskUser.deferred.reject(new Error('Session aborted'))
      this.pendingAskUser = null
    }
    if (this.pendingPlanApproval) {
      this.pendingPlanApproval.deferred.reject(new Error('Session aborted'))
      this.pendingPlanApproval = null
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error(`AgentSession ${this.id} has been disposed`)
    }
  }

  dispose(): void {
    if (this.disposed) return

    this.disposed = true
    this.rejectPendingGates()

    for (const unsub of this.agentUnsubs) unsub()
    this.agentUnsubs.length = 0

    this.agent.abort()
    this.emit('session_end', this.id)
    this.removeAllListeners()

    this.logger.info('Session %s disposed', this.id)
  }
}

function summarizeMessages(messages: readonly AgentMessage[], lastN: number): MessageSummaryItem[] {
  const start = Math.max(0, messages.length - lastN)

  return messages.slice(start).map((message, index) => {
    const serializedContent = typeof message.content === 'string'
      ? message.content
      : (JSON.stringify(message.content) ?? '')

    const toolName = message.role === 'tool_result'
      ? (message as { toolCallId?: string }).toolCallId
      : undefined

    return {
      index: start + index,
      role: message.role as MessageSummaryItem['role'],
      preview: serializedContent.slice(0, 200),
      toolName,
      tokenEstimate: Math.ceil(serializedContent.length / 4),
    }
  })
}