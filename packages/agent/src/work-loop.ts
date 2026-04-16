import { getToolCallsByAssistantMessage, hasToolCalls } from '@vitamin/ai'
import type {
  AssistantMessage,
  StreamContext,
  ThinkingLevel,
  ToolCall,
  ToolDefinition,
  ToolResultMessage,
} from '@vitamin/ai'
import type { DebugSnapshot, PauseResult } from '@vitamin/devtools'
import { AbortError, MaxToolTurnsError } from './errors'
import type { ToolExecutor } from './tool-executor'
import type {
  AgentEventType,
  AgentEvents,
  AgentMessage,
  AgentStatus,
  AgentTool,
  StreamFunction,
} from './types'
import type { MessageSummaryItem } from '@vitamin/devtools'

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
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
  // 配置（来自 AgentConfig）
  maxToolTurns: number
  devtools?: import('@vitamin/devtools').Devtools
  logger: import('@vitamin/shared').Logger
  getSteeringMessages: () => Promise<AgentMessage[]>
  getFollowUpMessages: () => Promise<AgentMessage[]>
  // 由 Agent.runLoop() 注入
  toolExecutor: ToolExecutor
  stream: StreamFunction
  signal: AbortSignal
  emitter: Emitter
  initialStatus?: AgentStatus
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
  const {
    signal,
    emitter,
    devtools,
    logger,
  } = ctx

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
    const transformed = await ctx.transformContext(contextMessages, signal)
    contextMessages = transformed

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
  const tools = createToolDefinitions(ctx.toolExecutor.list())

  const streamContext: StreamContext = {
    model: ctx.model,
    systemPrompt: params.systemPrompt,
    messages: llmMessages,
    tools: tools.length > 0 ? tools : undefined,
    thinkingLevel: params.thinkingLevel,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
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
// runTools — 单次工具调度：readonly 并行 + mutation 串行 + steering 检查
// 直接修改 messages（push tool result messages）
// ─────────────────────────────────────────────────────────────────────────────
async function runTools(
  assistantMessage: AssistantMessage,
  ctx: WorkLoopContext,
  turnIndex: number,
  lastTokenUsage: { input: number; output: number } | undefined,
): Promise<{ steeringInjected: boolean }> {
  const {
    toolExecutor,
    messages,
    signal,
    emitter,
    devtools,
    logger,
    getSteeringMessages,
  } = ctx

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
  const readonlySet = new Set(toolDefs.filter((t) => t.readonly).map((t) => t.name))
  const readOnlyCalls = toolCalls.filter((tc) => readonlySet.has(tc.name))
  const mutationCalls = toolCalls.filter((tc) => !readonlySet.has(tc.name))

  // steering 检查：在任何工具执行前检查一次
  const steeringMessages = await getSteeringMessages()

  await pause('steering_check', 1, {
    metadata: {
      hasSteeringMessages: steeringMessages.length > 0,
      steeringCount: steeringMessages.length,
    },
  })

  if (steeringMessages.length > 0) {
    messages.push(...steeringMessages)
    emitter.emit('steering_injected', { messages: steeringMessages })
    return { steeringInjected: true }
  }

  // 执行单个工具（含完整生命周期事件）
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

    const result = await toolExecutor.execute(toolCall, signal)

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

  // readonly 工具：并行执行
  if (readOnlyCalls.length > 0) {
    logger.info('Executing %d read-only tools in parallel', readOnlyCalls.length)
    await Promise.all(readOnlyCalls.map(executeSingleTool))
  }

  // mutation 工具：串行执行，每步前检查 steering
  for (const toolCall of mutationCalls) {
    if (signal.aborted) {
      throw new AbortError()
    }

    const steering = await getSteeringMessages()
    if (steering.length > 0) {
      messages.push(...steering)
      emitter.emit('steering_injected', { messages: steering })
      return { steeringInjected: true }
    }

    await executeSingleTool(toolCall)
  }

  return { steeringInjected: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// workLoop — 外层编排者：协调 runTurn / runTools / followUp
// ─────────────────────────────────────────────────────────────────────────────
export async function workLoop(context: WorkLoopContext): Promise<AssistantMessage> {
  let turnIndex = 0
  let toolTurnCount = 0
  let lastAssistantMessage: AssistantMessage | null = null
  let currentStatus: AgentStatus = context.initialStatus ?? 'idle'
  let lastTokenUsage: { input: number; output: number } | undefined

  const {
    messages,
    signal,
    logger,
    devtools,
    emitter,
  } = context

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

  try {
    logger.info(
      'Agent loop started for model %s with %d messages',
      context.model.id,
      messages.length,
    )

    await pause('loop_start', 0)

    outer: while (true) {
      if (signal.aborted) {
        throw new AbortError()
      }

      emitter.emit('status_change', { from: currentStatus, to: 'streaming' })
      currentStatus = 'streaming'

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

function createToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    visibility: tool.visibility,
  }))
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
