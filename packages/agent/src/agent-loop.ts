// Agent 双层循环 — 外循环(FollowUp) + 内循环(工具+Steering)
import { getToolCalls, hasToolCalls } from '@vitamin/ai'
import { invariant } from '@vitamin/invariant'

import { AbortError, MaxToolTurnsError } from './errors'

import type { ToolExecutor } from './tool-executor'
import type { AssistantMessage, StreamContext, ToolDefinition, StreamEvent } from '@vitamin/ai'
import type {
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentStatus,
  AgentTool,
} from './types'

type EmitFn = (event: AgentEvent) => void

export type StreamFunction = (
  context: StreamContext,
  signal: AbortSignal,
) => AsyncIterable<StreamEvent> & { result(): Promise<AssistantMessage> }

export interface AgentLoopOptions {
  messages: AgentMessage[]
  config: AgentLoopConfig
  toolExecutor: ToolExecutor
  stream?: StreamFunction
  signal: AbortSignal
  emit: EmitFn
  initialStatus?: AgentStatus
}

export async function agentLoop(options: AgentLoopOptions): Promise<AssistantMessage> {
  const { messages, config, toolExecutor, signal, emit } = options
  const stream = options.stream ?? options.stream
  if (!stream) {
    throw new Error('Agent loop requires stream function via options.stream')
  }

  let lastAssistantMessage: AssistantMessage | null = null
  let toolTurnCount = 0
  let turnIndex = 0
  let currentStatus: AgentStatus = options.initialStatus ?? 'idle'
  let lastTokenUsage: { input: number; output: number } | undefined

  try {
    await waitDebug({
      turn: turnIndex,
      point: 'loop:start',
      frameDepth: 0,
      messagesCount: messages.length,
      tokenUsage: lastTokenUsage,
    })

    while (true) {
      if (signal.aborted) throw new AbortError()

      

      emit({ type: 'status_change', from: currentStatus, to: 'streaming' })
      currentStatus = 'streaming'

      while (true) {
        if (signal.aborted) throw new AbortError()

        if (toolTurnCount > (config.maxToolTurns ?? 25)) {
          throw new MaxToolTurnsError(config.maxToolTurns ?? 25)
        }

        emit({ type: 'turn_start', turnIndex })

        let contextMessages = [...messages]
        if (config.transformContext) {
          const transformed = await config.transformContext(contextMessages, signal)
          contextMessages = transformed
        }

        const llmMessages = await config.convertToLlm(contextMessages)
        const tools = buildToolDefinitions(toolExecutor.getTools())

        const streamContext: StreamContext = {
          systemPrompt: config.systemPrompt,
          messages: llmMessages,
          tools: tools.length > 0 ? tools : undefined,
          thinkingLevel: config.thinkingLevel,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
        }

        await waitDebug({
          turn: turnIndex,
          point: 'model:before',
          frameDepth: 0,
          messagesCount: messages.length,
          tokenUsage: lastTokenUsage,
        })

        const eventStream = stream(streamContext, signal)

        for await (const event of eventStream) {
          emit({ type: 'stream_event', event })
          if (signal.aborted) throw new AbortError()
        }

        const assistantMessage = await eventStream.result()
        lastAssistantMessage = assistantMessage
        messages.push(assistantMessage as AgentMessage)
        lastTokenUsage = {
          input: assistantMessage.usage.inputTokens,
          output: assistantMessage.usage.outputTokens,
        }

        await waitDebug({
          turn: turnIndex,
          point: 'model:after',
          frameDepth: 0,
          messagesCount: messages.length,
          tokenUsage: lastTokenUsage,
        })

        emit({ type: 'turn_end', turnIndex, message: assistantMessage })
        turnIndex++

        if (hasToolCalls(assistantMessage)) {
          emit({ type: 'status_change', from: currentStatus, to: 'tool_executing' })
          currentStatus = 'tool_executing'

          const toolCalls = getToolCalls(assistantMessage)

          for (const toolCall of toolCalls) {
            if (signal.aborted) throw new AbortError()

            const steeringMessages = (await config.getSteeringMessages?.()) ?? []
            if (steeringMessages.length > 0) {
              messages.push(...steeringMessages)
              emit({ type: 'steering_injected', messages: steeringMessages })
              break
            }

            emit({
              type: 'tool_call_start',
              toolCall: {
                id: toolCall.id,
                name: toolCall.name,
                arguments: toolCall.arguments,
              },
            })

            await waitDebug({
              turn: turnIndex,
              point: 'tool:before',
              frameDepth: 1,
              messagesCount: messages.length,
              lastToolName: toolCall.name,
              tokenUsage: lastTokenUsage,
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

            await waitDebug({
              turn: turnIndex,
              point: 'tool:after',
              frameDepth: 1,
              messagesCount: messages.length,
              lastToolName: toolCall.name,
              tokenUsage: lastTokenUsage,
            })
          }

          toolTurnCount++
          emit({ type: 'status_change', from: currentStatus, to: 'streaming' })
          currentStatus = 'streaming'
          continue
        }

        if (assistantMessage.stopReason === 'end_turn') break
        if (assistantMessage.stopReason === 'max_tokens') break
        break
      }

      await waitDebug({
        turn: turnIndex,
        point: 'loop:end',
        frameDepth: 0,
        messagesCount: messages.length,
        tokenUsage: lastTokenUsage,
      })

      const followUpMessages = (await config.getFollowUpMessages?.()) ?? []
      if (followUpMessages.length > 0) {
        messages.push(...followUpMessages)
        emit({ type: 'follow_up_start', messages: followUpMessages })
        continue
      }

      break
    }

    if (!lastAssistantMessage) {
      throw new Error('Agent loop completed without producing a message')
    }

    await waitDebug({
      turn: turnIndex,
      point: 'agent:done',
      frameDepth: 0,
      messagesCount: messages.length,
      tokenUsage: lastTokenUsage,
    })

    if (process.env.NODE_ENV !== 'production') {
      invariant(() => true, '')
      loopDebugger?.notifyFinished?.('ok')
    }

    return lastAssistantMessage
  } catch (error) {
    if (error instanceof AbortError || signal.aborted) {
      if (process.env.NODE_ENV !== 'production') {
        invariant(() => true, '')
        loopDebugger?.notifyFinished?.('aborted', error instanceof Error ? error.message : undefined)
      }
      throw error
    }

    await waitDebug({
      turn: turnIndex,
      point: 'agent:error',
      frameDepth: 0,
      messagesCount: messages.length,
      tokenUsage: lastTokenUsage,
    })

    if (process.env.NODE_ENV !== 'production') {
      invariant(() => true, '')
      loopDebugger?.notifyFinished?.('error', error instanceof Error ? error.message : String(error))
    }

    throw error
  } finally {
    if (process.env.NODE_ENV !== 'production') {
      invariant(() => true, '')
      loopDebugger?.close?.()
    }
  }
}

function buildToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    visibility: tool.visibility,
  }))
}
