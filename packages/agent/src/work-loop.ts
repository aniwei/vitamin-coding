import { getToolCallsByAssistantMessage, hasToolCalls, isPromptTooLong } from '@vitamin/ai'
import type {
  AssistantMessage,
  PromptCacheMetadata,
  StreamContext,
  ThinkingLevel,
  ToolCall,
  ToolDefinition,
  ToolResultMessage,
} from '@vitamin/ai'
import type { DebugSnapshot, PauseResult } from '@vitamin/devtools'
import { AbortError, MaxToolTurnsError } from './errors'
import { partitionToolCalls } from './tool-partitioner'
import type { ToolExecutor } from './tool-executor'
import type {
  AgentEvent,
  AgentEventType,
  AgentEvents,
  AgentMessage,
  AgentStatus,
  AgentTool,
  ContextTransformResult,
  StreamFunction,
  ToolResult,
} from './types'
import type { MessageSummaryItem } from '@vitamin/devtools'

const DEFAULT_PROMPT_TOO_LONG_RETRIES = 2

interface Emitter {
  emit<K extends AgentEventType>(type: K, ...args: Parameters<AgentEvents[K]>): void
}
type SnapshotMetadata = Record<string, string | number | boolean | null>

// WorkLoopContext — workLoop 引擎的完整执行契约，由 Agent.runLoop() 组装
export interface WorkLoopContext {
  // 执行参数（来自 AgentRunContext）
  model: import('@vitamin/ai').Model
  systemPrompt: string
  messages: AgentMessage[]
  thinkingLevel: ThinkingLevel
  maxTokens?: number
  temperature?: number
  convertToLLM: (
    messages: AgentMessage[],
  ) => import('@vitamin/ai').Message[] | Promise<import('@vitamin/ai').Message[]>
  transformContext?: import('./types').ContextTransform
  maxPromptTooLongRetries?: number
  // 配置（来自 AgentConfig）
  maxToolTurns: number
  devtools?: import('@vitamin/devtools').Devtools
  logger: import('@vitamin/shared').Logger
  getSteeringMessages: () => Promise<AgentMessage[]>
  getFollowUpMessages: () => Promise<AgentMessage[]>
  cacheRetention?: 'none' | 'short' | 'long'
  promptCache?: PromptCacheMetadata
  scopeId?: string
  deferredManager?: import('./deferred-tools').DeferredToolManager
  // 由 Agent.runLoop() 注入
  toolExecutor: ToolExecutor
  stream: StreamFunction
  signal: AbortSignal
  emitter?: Emitter
  emit?: (event: AgentEvent) => void
  initialStatus?: AgentStatus
}

function resolveEmitter(context: WorkLoopContext): Emitter {
  if (context.emitter) {
    return context.emitter
  }

  return {
    emit(type, ...args) {
      const payload = args[0] as Record<string, unknown> | undefined
      context.emit?.({ type, ...(payload as Record<string, unknown>) } as AgentEvent)
    },
  }
}

// LLM 参数的可变快照 — devtools 在 model_before pause 时可修改
interface MutableLLMParams {
  systemPrompt: string
  thinkingLevel: ThinkingLevel | undefined
  maxTokens: number | undefined
  temperature: number | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// runTurn — 单次 LLM 调用：上下文转换 → 流式推理 → 返回 AssistantMessage
// 不修改 ctx.messages，由调用方（workLoop）负责 push 结果
// ─────────────────────────────────────────────────────────────────────────────
async function runTurn(
  ctx: WorkLoopContext,
  params: MutableLLMParams,
  turnIndex: number,
  lastTokenUsage: { input: number; output: number } | undefined,
): Promise<AssistantMessage> {
  const { signal, devtools, logger } = ctx
  const emitter = resolveEmitter(ctx)

  const pause = (
    point: DebugSnapshot['point'],
    frameDepth: number,
    options: {
      messagesCount?: number
      summarySource?: AgentMessage[]
      lastToolName?: string
      metadata?: SnapshotMetadata
    } = {},
  ) =>
    devtools?.debugger.pause({
      turn: turnIndex,
      point,
      frameDepth,
      messagesCount: options.messagesCount ?? ctx.messages.length,
      lastToolName: options.lastToolName,
      tokenUsage: lastTokenUsage ?? { input: 0, output: 0 },
      metadata: options.metadata ?? {},
      systemPrompt: params.systemPrompt ?? '',
      messagesSummary: summarizeMessages(options.summarySource ?? ctx.messages, 10),
      llmParams: {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        thinkingLevel: params.thinkingLevel,
      },
    })

  // 1. 上下文转换（压缩/裁剪/注入）
  let contextMessages = [...ctx.messages]
  if (ctx.transformContext) {
    const transformed = normalizeTransformResult(
      await ctx.transformContext(contextMessages, signal, { reason: 'preflight' }),
    )
    contextMessages = transformed.messages

    if (contextMessages.length !== ctx.messages.length) {
      logger.info(
        'Context transformed for turn %d: %d -> %d messages',
        turnIndex + 1,
        ctx.messages.length,
        contextMessages.length,
      )
    }

    await pause('context_transform', 0, {
      messagesCount: contextMessages.length,
      summarySource: contextMessages,
      metadata: {
        originalCount: ctx.messages.length,
        transformedCount: contextMessages.length,
      },
    })
  }

  // 2. 转换为 LLM 消息格式，构建 StreamContext
  const llmMessages = await ctx.convertToLLM(contextMessages)
  const tools = createToolDefinitions(ctx.toolExecutor.list(), ctx.deferredManager)
  const promptCache = ctx.promptCache
    ? {
        ...ctx.promptCache,
        toolSchemaFingerprint: fingerprintToolDefinitions(tools),
      }
    : undefined

  const streamContext: StreamContext = {
    model: ctx.model,
    systemPrompt: params.systemPrompt,
    messages: llmMessages,
    tools: tools.length > 0 ? tools : undefined,
    thinkingLevel: params.thinkingLevel,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    cacheRetention: ctx.cacheRetention,
    promptCache,
    scopeId: ctx.scopeId,
  }

  // 3. devtools model_before pause — 可修改 params 与 messages（影响后续 turn）
  consume(await pause('model_before', 0), {
    getSystemPrompt: () => params.systemPrompt,
    setSystemPrompt: (v) => {
      params.systemPrompt = v
    },
    getTemperature: () => params.temperature,
    setTemperature: (v) => {
      params.temperature = v
    },
    getMaxTokens: () => params.maxTokens,
    setMaxTokens: (v) => {
      params.maxTokens = v
    },
    getThinkingLevel: () => params.thinkingLevel,
    setThinkingLevel: (v) => {
      params.thinkingLevel = v as ThinkingLevel
    },
    messages: ctx.messages,
  })

  // 4. 流式推理
  const es = ctx.stream(streamContext, signal)

  for await (const event of es) {
    emitter.emit('stream_event', { event })
    if (signal.aborted) {
      throw new AbortError()
    }
  }

  const assistantMessage = await es.result()

  logger.info(
    'Turn %d completed with stop reason %s (input=%d, output=%d)',
    turnIndex + 1,
    assistantMessage.stopReason,
    assistantMessage.usage.inputTokens,
    assistantMessage.usage.outputTokens,
  )

  await pause('model_after', 0)

  return assistantMessage
}

// ─────────────────────────────────────────────────────────────────────────────
// runTools — 按序分批工具调度：保留 LLM 给出的顺序，consecutive readonly 并行，
// 每个 mutation 单独串行，每批前检查 steering
// ─────────────────────────────────────────────────────────────────────────────
async function runTools(
  assistantMessage: AssistantMessage,
  ctx: WorkLoopContext,
  turnIndex: number,
  lastTokenUsage: { input: number; output: number } | undefined,
): Promise<{ steeringInjected: boolean }> {
  const { toolExecutor, messages, signal, devtools, logger, getSteeringMessages } = ctx
  const emitter = resolveEmitter(ctx)

  const pause = (
    point: DebugSnapshot['point'],
    frameDepth: number,
    options: {
      lastToolName?: string
      metadata?: SnapshotMetadata
    } = {},
  ) =>
    devtools?.debugger.pause({
      turn: turnIndex,
      point,
      frameDepth,
      messagesCount: messages.length,
      lastToolName: options.lastToolName,
      tokenUsage: lastTokenUsage ?? { input: 0, output: 0 },
      metadata: options.metadata ?? {},
      systemPrompt: '',
      messagesSummary: [],
      llmParams: {},
    })

  const toolCalls = getToolCallsByAssistantMessage(assistantMessage)
  const toolDefs = toolExecutor.list()
  const batches = partitionToolCalls(toolCalls, toolDefs)

  const executeSingleTool = async (toolCall: ToolCall) => {
    if (signal.aborted) {
      throw new AbortError()
    }

    emitter.emit('tool_call_start', {
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
    })

    logger.info('Executing tool %s', toolCall.name)

    await pause('tool_before', 1, { lastToolName: toolCall.name })

    let result: ToolResult | undefined
    for await (const event of toolExecutor.executeStream(toolCall, signal)) {
      emitter.emit('tool_execution_event', { event })
      if (event.type === 'result') {
        result = event.result
      }
    }

    if (!result) {
      result = {
        content: [{ type: 'text', text: `Tool ${toolCall.name} completed without result event` }],
        isError: true,
      }
    }

    const toolResultMessage: ToolResultMessage = {
      role: 'tool_result',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: result.content,
      isError: result.isError ?? false,
      details: result.details ?? {},
      timestamp: Date.now(),
    }
    messages.push(toolResultMessage)

    emitter.emit('tool_call_end', {
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      },
      result,
    })

    logger.info('Tool %s completed%s', toolCall.name, result.isError ? ' with error' : '')

    await pause('tool_after', 1, { lastToolName: toolCall.name })
  }

  for (const batch of batches) {
    if (signal.aborted) {
      throw new AbortError()
    }

    const steering = await getSteeringMessages()

    await pause('steering_check', 1, {
      metadata: {
        hasSteeringMessages: steering.length > 0,
        steeringCount: steering.length,
      },
    })

    if (steering.length > 0) {
      messages.push(...steering)
      emitter.emit('steering_injected', { messages: steering })
      return { steeringInjected: true }
    }

    if (batch.isConcurrencySafe) {
      logger.info('Executing %d read-only tools in parallel', batch.toolCalls.length)
      await Promise.all(batch.toolCalls.map(executeSingleTool))
    } else {
      const firstToolCall = batch.toolCalls[0]
      if (firstToolCall) {
        await executeSingleTool(firstToolCall)
      }
    }
  }

  return { steeringInjected: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// workLoop — 外层编排者：协调 runTurn / runTools / followUp
// ─────────────────────────────────────────────────────────────────────────────
export async function workLoop(context: WorkLoopContext): Promise<AssistantMessage> {
  if (!context.stream) {
    throw new Error('Agent loop requires stream function via options.stream')
  }

  let turnIndex = 0
  let toolTurnCount = 0
  let lastAssistantMessage: AssistantMessage | null = null
  let currentStatus: AgentStatus = context.initialStatus ?? 'idle'
  let lastTokenUsage: { input: number; output: number } | undefined

  const { messages, signal, logger, devtools } = context
  const emitter = resolveEmitter(context)

  // LLM 参数的可变快照 — devtools 在 model_before 可修改，影响后续 turn
  const params: MutableLLMParams = {
    systemPrompt: context.systemPrompt,
    thinkingLevel: context.thinkingLevel,
    maxTokens: context.maxTokens,
    temperature: context.temperature,
  }

  const pause = (
    point: DebugSnapshot['point'],
    frameDepth: number,
    options: {
      messagesCount?: number
      summarySource?: AgentMessage[]
      metadata?: SnapshotMetadata
    } = {},
  ) =>
    devtools?.debugger.pause({
      turn: turnIndex,
      point,
      frameDepth,
      messagesCount: options.messagesCount ?? messages.length,
      tokenUsage: lastTokenUsage ?? { input: 0, output: 0 },
      metadata: options.metadata ?? {},
      systemPrompt: params.systemPrompt ?? '',
      messagesSummary: summarizeMessages(options.summarySource ?? messages, 10),
      llmParams: {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        thinkingLevel: params.thinkingLevel,
      },
    })

  logger.info('Agent loop started for model %s with %d messages', context.model.id, messages.length)

  await pause('loop_start', 0)

  let promptTooLongRetries = 0
  const maxPromptTooLongRetries = context.maxPromptTooLongRetries ?? DEFAULT_PROMPT_TOO_LONG_RETRIES

  try {
    outer: while (true) {
      if (signal.aborted) {
        throw new AbortError()
      }

      emitter.emit('status_change', { from: currentStatus, to: 'streaming' })
      currentStatus = 'streaming'

      try {
        while (true) {
          if (signal.aborted) {
            throw new AbortError()
          }

          if (toolTurnCount > (context.maxToolTurns ?? 25)) {
            throw new MaxToolTurnsError(context.maxToolTurns ?? 25)
          }

          emitter.emit('turn_start', { turnIndex })
          logger.info('Turn %d started', turnIndex + 1)

          const assistantMessage = await runTurn(context, params, turnIndex, lastTokenUsage)
          promptTooLongRetries = 0

          messages.push(assistantMessage)
          lastAssistantMessage = assistantMessage
          lastTokenUsage = {
            input: assistantMessage.usage.inputTokens,
            output: assistantMessage.usage.outputTokens,
          }

          emitter.emit('turn_end', { turnIndex, message: assistantMessage })
          turnIndex++

          if (hasToolCalls(assistantMessage)) {
            emitter.emit('status_change', { from: currentStatus, to: 'tool_executing' })
            currentStatus = 'tool_executing'

            await runTools(assistantMessage, context, turnIndex, lastTokenUsage)

            toolTurnCount++

            emitter.emit('status_change', { from: currentStatus, to: 'streaming' })
            currentStatus = 'streaming'
            continue
          }

          // end_turn 或 max_tokens → 退出内层循环
          break
        }
      } catch (error) {
        if (error instanceof AbortError || signal.aborted) {
          throw error
        }

        if (isPromptTooLong(error) && context.transformContext) {
          if (promptTooLongRetries >= maxPromptTooLongRetries) {
            logger.warn(
              'Prompt too long at turn %d after %d recovery attempt(s), giving up',
              turnIndex + 1,
              promptTooLongRetries,
            )
            throw error
          }

          const beforeCount = messages.length
          const beforeSignature = messageSignature(messages)
          const attempt = promptTooLongRetries + 1
          logger.warn(
            'Prompt too long at turn %d, triggering reactive auto-compaction attempt %d/%d',
            turnIndex + 1,
            attempt,
            maxPromptTooLongRetries,
          )

          const transformed = normalizeTransformResult(
            await context.transformContext(messages, signal, {
              reason: 'prompt-too-long',
              attempt,
              error: error instanceof Error ? error : undefined,
              tokenCount: error.tokenCount,
            }),
          )
          const afterSignature = messageSignature(transformed.messages)

          emitter.emit('compaction_needed', {
            tokenCount: error.tokenCount ?? 0,
            threshold: context.model.contextWindow,
            attempt,
            maxAttempts: maxPromptTooLongRetries,
            beforeCount,
            afterCount: transformed.messages.length,
            metadata: transformed.metadata,
          })

          if (beforeSignature === afterSignature) {
            logger.warn(
              'Reactive auto-compaction made no context change at turn %d, rethrowing prompt-too-long',
              turnIndex + 1,
            )
            throw error
          }

          messages.length = 0
          messages.push(...transformed.messages)
          promptTooLongRetries = attempt
          logger.info(
            'Reactive auto-compaction changed context from %d to %d messages, retrying',
            beforeCount,
            messages.length,
          )
          continue outer
        }

        throw error
      }

      await pause('loop_end', 0)

      const followUpMessages = await context.getFollowUpMessages()

      await pause('follow_up_check', 0, {
        metadata: {
          hasFollowUp: followUpMessages.length > 0,
          followUpCount: followUpMessages.length,
        },
      })

      if (followUpMessages.length > 0) {
        messages.push(...followUpMessages)
        logger.info('Queued %d follow-up message(s)', followUpMessages.length)
        emitter.emit('follow_up_start', { messages: followUpMessages })
        continue outer
      }

      break
    }

    if (!lastAssistantMessage) {
      throw new Error('Agent loop completed without producing a message')
    }

    await pause('agent_done', 0)
    logger.info('Agent loop finished after %d turn(s)', turnIndex)

    return lastAssistantMessage
  } catch (error) {
    if (error instanceof AbortError || signal.aborted) {
      logger.warn('Agent loop aborted at turn %d', turnIndex + 1)
      await pause('agent_aborted', 0)
      throw error
    }

    logger.error(
      'Agent loop failed at turn %d: %s',
      turnIndex + 1,
      error instanceof Error ? error.message : String(error),
    )
    await pause('agent_error', 0)
    throw error
  } finally {
    await pause('loop_cleanup', 0)
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeTransformResult(
  result: AgentMessage[] | ContextTransformResult,
): ContextTransformResult {
  if (Array.isArray(result)) {
    return { messages: result }
  }

  return result
}

function messageSignature(messages: AgentMessage[]): string {
  try {
    return JSON.stringify(messages)
  } catch {
    return `count:${messages.length}`
  }
}

function createToolDefinitions(
  tools: AgentTool[],
  deferredManager?: import('./deferred-tools').DeferredToolManager,
): ToolDefinition[] {
  const active = deferredManager ? deferredManager.getActiveTools(tools) : tools
  return active.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    visibility: tool.visibility,
  }))
}

function fingerprintToolDefinitions(tools: ToolDefinition[]): string {
  let hash = 5381
  const input = tools
    .map((tool) => {
      const schema = tool.parameters.toJSONSchema?.() ?? {}
      return JSON.stringify({
        name: tool.name,
        description: tool.description,
        visibility: tool.visibility,
        schema,
      })
    })
    .sort()
    .join('\0')

  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function summarizeMessages(messages: AgentMessage[], lastN: number): MessageSummaryItem[] {
  const start = Math.max(0, messages.length - lastN)
  return messages.slice(start).map((msg, i) => ({
    index: start + i,
    role: msg.role as MessageSummaryItem['role'],
    preview:
      typeof msg.content === 'string'
        ? msg.content.slice(0, 200)
        : JSON.stringify(msg.content).slice(0, 200),
    toolName: msg.role === 'tool_result' ? (msg as ToolResultMessage).toolName : undefined,
    tokenEstimate: Math.ceil(
      (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length) /
        4,
    ),
  }))
}

interface PayloadApplyTarget {
  getSystemPrompt: () => string | undefined
  setSystemPrompt: (v: string) => void
  getTemperature: () => number | undefined
  setTemperature: (v: number) => void
  getMaxTokens: () => number | undefined
  setMaxTokens: (v: number) => void
  getThinkingLevel: () => string | undefined
  setThinkingLevel: (v: string) => void
  messages: AgentMessage[]
}

function consume(result: PauseResult | undefined, target: PayloadApplyTarget): void {
  if (result?.command.type === 'stop') {
    throw new AbortError('Stopped by debugger')
  }

  const payload = result?.payload
  if (!payload) {
    return
  }

  if (payload.systemPrompt !== undefined) {
    target.setSystemPrompt(payload.systemPrompt)
  }

  if (payload.removeMessageIndices?.length) {
    const sorted = [...payload.removeMessageIndices].sort((a, b) => b - a)
    for (const idx of sorted) {
      if (idx >= 0 && idx < target.messages.length) {
        target.messages.splice(idx, 1)
      }
    }
  }

  if (payload.injectMessages?.length) {
    for (const msg of payload.injectMessages) {
      if (msg.role === 'user') {
        target.messages.push({ role: 'user', content: msg.content, timestamp: Date.now() })
      }
    }
  }

  if (payload.llmParams) {
    if (payload.llmParams.temperature !== undefined) {
      target.setTemperature(payload.llmParams.temperature)
    }
    if (payload.llmParams.maxTokens !== undefined) {
      target.setMaxTokens(payload.llmParams.maxTokens)
    }
    if (payload.llmParams.thinkingLevel !== undefined) {
      target.setThinkingLevel(payload.llmParams.thinkingLevel)
    }
  }
}
