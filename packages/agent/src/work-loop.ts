import { 
  getToolCallsByAssistantMessage, 
  hasToolCalls 
} from '@vitamin/ai'
import { 
  AbortError, 
  MaxToolTurnsError 
} from './errors'
import type { ToolExecutor } from './tool-executor'
import type { 
  AssistantMessage, 
  StreamContext, 
  ToolDefinition, 
  StreamEvent 
} from '@vitamin/ai'
import type { 
  MessageSummaryItem, 
  PauseResult,
  DebugSnapshot,
} from '@vitamin/devtools'
import type {
  AgentEvent,
  AgentLoopContext,
  AgentMessage,
  AgentStatus,
  AgentTool,
} from './types'

type Emit = (event: AgentEvent) => void
type SnapshotMetadata = Record<string, string | number | boolean | null>

export type StreamFunction = (
  context: StreamContext,
  signal: AbortSignal,
) => AsyncIterable<StreamEvent> & { result(): Promise<AssistantMessage> }

export interface WorkLoopContext extends AgentLoopContext {
  messages: AgentMessage[]
  toolExecutor: ToolExecutor
  stream?: StreamFunction
  signal: AbortSignal
  emit: Emit
  initialStatus?: AgentStatus
}

export async function workLoop(context: WorkLoopContext): Promise<AssistantMessage> {
  const stream = context.stream
  
  if (!stream) {
    throw new Error('Agent loop requires stream function via options.stream')
  }

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
    toolExecutor, 
    maxToolTurns, 
    getSteeringMessages,
    getFollowUpMessages,
    transformContext, 
    convertToLLM,
    emit, 
  } = context

  let systemPrompt = context.systemPrompt
  let temperature = context.temperature
  let maxTokens = context.maxTokens
  let thinkingLevel = context.thinkingLevel

  const pause = (
    point: DebugSnapshot['point'],
    frameDepth: number,
    options: {
      messagesCount?: number
      summarySource?: AgentMessage[]
      lastToolName?: string
      metadata?: SnapshotMetadata
    } = {},
  ) => devtools?.debugger.pause({
    turn: turnIndex,
    point,
    frameDepth,
    messagesCount: options.messagesCount ?? messages.length,
    lastToolName: options.lastToolName,
    tokenUsage: lastTokenUsage ?? { input: 0, output: 0 },
    metadata: options.metadata ?? {},
    systemPrompt: systemPrompt ?? '',
    messagesSummary: summarizeMessages(options.summarySource ?? messages, 10),
    llmParams: { temperature, maxTokens, thinkingLevel },
  })

  try {
    logger.info('Agent loop started for model %s with %d messages', context.model.id, messages.length)

    await pause('loop_start', 0)
    
    while (true) {
      if (signal.aborted) throw new AbortError()

      emit({ 
        type: 'status_change', 
        from: currentStatus, 
        to: 'streaming' 
      })

      currentStatus = 'streaming'

      while (true) {
        if (signal.aborted) throw new AbortError()

        if (toolTurnCount > (maxToolTurns ?? 25)) {
          throw new MaxToolTurnsError(maxToolTurns ?? 25)
        }

        emit({ type: 'turn_start', turnIndex })

        logger.info('Turn %d started', turnIndex + 1)

        let contextMessages = [...messages]
        if (transformContext) {
          const transformed = await transformContext(contextMessages, signal)
          contextMessages = transformed

          if (contextMessages.length !== messages.length) {
            logger.info(
              'Context transformed for turn %d: %d -> %d messages',
              turnIndex + 1,
              messages.length,
              contextMessages.length,
            )
          }

          await pause('context_transform', 0, {
            messagesCount: contextMessages.length,
            summarySource: contextMessages,
            metadata: { originalCount: messages.length, transformedCount: contextMessages.length },
          })
        }

        const llmMessages = await convertToLLM(contextMessages)
        const tools = createToolDefinitions(toolExecutor.list())

        const context: StreamContext = {
          systemPrompt,
          messages: llmMessages,
          tools: tools.length > 0 ? tools : undefined,
          thinkingLevel,
          maxTokens,
          temperature
        }

        consume(await pause('model_before', 0), {
          getSystemPrompt: () => systemPrompt,
          setSystemPrompt: (v) => { systemPrompt = v },
          getTemperature: () => temperature,
          setTemperature: (v) => { temperature = v },
          getMaxTokens: () => maxTokens,
          setMaxTokens: (v) => { maxTokens = v },
          getThinkingLevel: () => thinkingLevel,
          setThinkingLevel: (v) => { thinkingLevel = v as any },
          messages,
        })
        
        const es = stream(context, signal)

        for await (const event of es) {
          emit({ type: 'stream_event', event })
          if (signal.aborted) throw new AbortError()
        }

        const assistantMessage = await es.result()
        lastAssistantMessage = assistantMessage
        messages.push(assistantMessage as AgentMessage)
        lastTokenUsage = {
          input: assistantMessage.usage.inputTokens,
          output: assistantMessage.usage.outputTokens,
        }

        logger.info(
          'Turn %d completed with stop reason %s (input=%d, output=%d)',
          turnIndex + 1,
          assistantMessage.stopReason,
          assistantMessage.usage.inputTokens,
          assistantMessage.usage.outputTokens,
        )

        await pause('model_after', 0)

        emit({ 
          type: 'turn_end', 
          turnIndex, 
          message: assistantMessage 
        })

        turnIndex++

        if (hasToolCalls(assistantMessage)) {
          emit({ 
            type: 'status_change', 
            from: currentStatus, 
            to: 'tool_executing' 
          })
          
          currentStatus = 'tool_executing'

          const toolCalls = getToolCallsByAssistantMessage(assistantMessage)

          // Build readonly lookup from tool definitions
          const toolDefs = toolExecutor.list()
          const readonlySet = new Set(toolDefs.filter(t => t.readonly).map(t => t.name))

          // Split into readonly and mutation batches
          const readOnlyCalls = toolCalls.filter(tc => readonlySet.has(tc.name))
          const mutationCalls = toolCalls.filter(tc => !readonlySet.has(tc.name))

          // Helper: execute a single tool call with full event lifecycle
          const executeSingleTool = async (toolCall: typeof toolCalls[number]) => {
            if (signal.aborted) throw new AbortError()

            emit({
              type: 'tool_call_start',
              toolCall: {
                id: toolCall.id,
                name: toolCall.name,
                arguments: toolCall.arguments,
              },
            })

            logger.info('Executing tool %s', toolCall.name)

            await pause('tool_before', 1, {
              lastToolName: toolCall.name,
            })

            const result = await toolExecutor.execute(toolCall, signal)

            const toolResultMessage = {
              role: 'tool_result' as const,
              toolCallId: toolCall.id,
              content: result.content,
              isError: result.isError ?? false,
            }
            messages.push(toolResultMessage as AgentMessage)

            emit({
              type: 'tool_call_end',
              toolCall: {
                id: toolCall.id,
                name: toolCall.name,
                arguments: toolCall.arguments,
              },
              result,
            })

            logger.info(
              'Tool %s completed%s',
              toolCall.name,
              result.isError ? ' with error' : '',
            )

            await pause('tool_after', 1, {
              lastToolName: toolCall.name,
            })
          }

          // Check steering before executing any tools
          const steeringMessages = (await getSteeringMessages?.()) ?? []

          await pause('steering_check', 1, {
            metadata: { hasSteeringMessages: steeringMessages.length > 0, steeringCount: steeringMessages.length },
          })

          if (steeringMessages.length > 0) {
            messages.push(...steeringMessages)
            emit({ type: 'steering_injected', messages: steeringMessages })
          } else {
            // Read-only tools: execute in parallel
            if (readOnlyCalls.length > 0) {
              logger?.info('Executing %d read-only tools in parallel', readOnlyCalls.length)
              await Promise.all(readOnlyCalls.map(executeSingleTool))
            }

            // Mutation tools: execute sequentially with steering checks
            for (const toolCall of mutationCalls) {
              if (signal.aborted) throw new AbortError()

              const steering = (await getSteeringMessages?.()) ?? []
              if (steering.length > 0) {
                messages.push(...steering)
                emit({ type: 'steering_injected', messages: steering })
                break
              }

              await executeSingleTool(toolCall)
            }
          }

          toolTurnCount++
          emit({ 
            type: 'status_change', 
            from: currentStatus, 
            to: 'streaming' 
          })

          currentStatus = 'streaming'
          continue
        }

        if (assistantMessage.stopReason === 'end_turn') break
        if (assistantMessage.stopReason === 'max_tokens') break
        break
      }

      await pause('loop_end', 0)

      const followUpMessages = (await getFollowUpMessages?.()) ?? []

      await pause('follow_up_check', 0, {
        metadata: { hasFollowUp: followUpMessages.length > 0, followUpCount: followUpMessages.length },
      })

      if (followUpMessages.length > 0) {
        messages.push(...followUpMessages)

        logger.info('Queued %d follow-up message(s)', followUpMessages.length)

        emit({ 
          type: 'follow_up_start', 
          messages: followUpMessages 
        })
        continue
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
    preview: typeof msg.content === 'string'
      ? msg.content.slice(0, 200)
      : JSON.stringify(msg.content).slice(0, 200),
    toolName: msg.role === 'tool_result' ? (msg as any).toolCallId : undefined,
    tokenEstimate: Math.ceil(
      (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length) / 4,
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

  if (payload?.systemPrompt !== undefined) {
    target.setSystemPrompt(payload.systemPrompt)
  }

  if (payload?.removeMessageIndices?.length) {
    const sorted = [...payload.removeMessageIndices].sort((a, b) => b - a)
    for (const idx of sorted) {
      if (idx >= 0 && idx < target.messages.length) {
        target.messages.splice(idx, 1)
      }
    }
  }

  if (payload?.injectMessages?.length) {
    for (const msg of payload.injectMessages) {
      target.messages.push({ role: msg.role, content: msg.content } as AgentMessage)
    }
  }

  if (payload?.llmParams) {
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
