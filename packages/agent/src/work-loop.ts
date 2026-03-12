// Agent 双层循环 — 外循环(FollowUp) + 内循环(工具+Steering)
import { getToolCalls, hasToolCalls } from '@vitamin/ai'
import { invariant } from '@vitamin/invariant'

import { AbortError, MaxToolTurnsError } from './errors'

import type { ToolExecutor } from './tool-executor'
import type { AssistantMessage, StreamContext, ToolDefinition, StreamEvent } from '@vitamin/ai'
import type {
  AgentEvent,
  AgentLoopRuntime,
  AgentMessage,
  AgentStatus,
  AgentTool,
} from './types'

type Emit = (event: AgentEvent) => void

export type StreamFunction = (
  context: StreamContext,
  signal: AbortSignal,
) => AsyncIterable<StreamEvent> & { result(): Promise<AssistantMessage> }

export interface ProgressRuntime extends AgentLoopRuntime {
  messages: AgentMessage[]
  toolExecutor: ToolExecutor
  stream?: StreamFunction
  signal: AbortSignal
  emit: Emit
  initialStatus?: AgentStatus
}

export async function workLoop(runtime: ProgressRuntime): Promise<AssistantMessage> {
  const stream = runtime.stream
  
  if (!stream) {
    throw new Error('Agent loop requires stream function via options.stream')
  }

  const { devtools } = runtime
  let lastAssistantMessage: AssistantMessage | null = null
  let toolTurnCount = 0
  let turnIndex = 0
  let currentStatus: AgentStatus = runtime.initialStatus ?? 'idle'
  let lastTokenUsage: { input: number; output: number } | undefined

  const { 
    messages, 
    toolExecutor, 
    signal, 
    systemPrompt,
    maxToolTurns, 
    thinkingLevel,
    maxTokens,
    temperature,
    getSteeringMessages,
    getFollowUpMessages,
    emit, 
    transformContext, 
    convertToLLM,
  } = runtime

  try {
    invariant(() => {
      devtools?.debugger.paused({
        turn: turnIndex,
        point: 'loop:start',
        frameDepth: 0,
        messagesCount: messages.length,
        tokenUsage: lastTokenUsage,  
      })

      return true
    }, `Agent loop started with model ${runtime.model.name}`)
    
    while (true) {
      if (signal.aborted) throw new AbortError()

      emit({ type: 'status_change', from: currentStatus, to: 'streaming' })
      currentStatus = 'streaming'

      while (true) {
        if (signal.aborted) throw new AbortError()

        if (toolTurnCount > (maxToolTurns ?? 25)) {
          throw new MaxToolTurnsError(maxToolTurns ?? 25)
        }

        emit({ type: 'turn_start', turnIndex })

        let contextMessages = [...messages]
        if (transformContext) {
          const transformed = await transformContext(contextMessages, signal)
          contextMessages = transformed
        }

        const llmMessages = await convertToLLM(contextMessages)
        const tools = createToolDefinitions(toolExecutor.getTools())

        const context: StreamContext = {
          systemPrompt,
          messages: llmMessages,
          tools: tools.length > 0 ? tools : undefined,
          thinkingLevel,
          maxTokens,
          temperature
        }

        invariant(() => {
          devtools?.debugger.paused({
            turn: turnIndex,
            point: 'model:before',
            frameDepth: 0,
            messagesCount: messages.length,
            tokenUsage: lastTokenUsage,  
          })

          return true
        }, `Turn ${turnIndex} before model stream`)

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

        invariant(() => {
          devtools?.debugger.paused({
            turn: turnIndex,
            point: 'model:after',
            frameDepth: 0,
            messagesCount: messages.length,
            tokenUsage: lastTokenUsage,  
          })

          return true
        }, `Turn ${turnIndex} after model stream`)

        emit({ type: 'turn_end', turnIndex, message: assistantMessage })
        turnIndex++

        if (hasToolCalls(assistantMessage)) {
          emit({ type: 'status_change', from: currentStatus, to: 'tool_executing' })
          currentStatus = 'tool_executing'

          const toolCalls = getToolCalls(assistantMessage)

          for (const toolCall of toolCalls) {
            if (signal.aborted) throw new AbortError()

            const steeringMessages = (await getSteeringMessages?.()) ?? []
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

            invariant(() => {
              devtools?.debugger.paused({
                turn: turnIndex,
                point: 'tool_before',
                frameDepth: 1,
                messagesCount: messages.length,
                lastToolName: toolCall.name,
                tokenUsage: lastTokenUsage,  
              })

              return true
            }, `Turn ${turnIndex} before tool call ${toolCall.name}`)

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

            invariant(() => {
              devtools?.debugger.paused({
                turn: turnIndex,
                point: 'tool_after',
                frameDepth: 1,
                messagesCount: messages.length,
                lastToolName: toolCall.name,
                tokenUsage: lastTokenUsage,  
              })

              return true
            }, `Turn ${turnIndex} after tool call ${toolCall.name}`)
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

      invariant(() => {
        devtools?.debugger.paused({
          turn: turnIndex,
          point: 'loop:end',
          frameDepth: 0,
          messagesCount: messages.length,
          tokenUsage: lastTokenUsage,  
        })

        return true
      }, `Turn ${turnIndex} end of loop`)

      const followUpMessages = (await getFollowUpMessages?.()) ?? []
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

    invariant(() => {
      devtools?.debugger.paused({
        turn: turnIndex,
        point: 'agent:done',
        frameDepth: 0,
        messagesCount: messages.length,
        tokenUsage: lastTokenUsage,  
      })

      return true
    }, `Agent done at turn ${turnIndex}`)

    return lastAssistantMessage
  } catch (error) {
    if (error instanceof AbortError || signal.aborted) {
      invariant(() => {
        devtools?.debugger.paused({
          turn: turnIndex,
          point: 'agent_aborted',
          frameDepth: 0,
          messagesCount: messages.length,
          tokenUsage: lastTokenUsage,  
        })

        return true
      }, `Agent aborted at turn ${turnIndex}`)

      throw error
    }

    invariant(() => {
      devtools?.debugger.paused({
        turn: turnIndex,
        point: 'agent_error',
        frameDepth: 0,
        messagesCount: messages.length,
        tokenUsage: lastTokenUsage,  
      })

      return true
    }, `Agent error at turn ${turnIndex}: ${error instanceof Error ? error.message : String(error)}`)

    throw error
  } finally {
    invariant(() => {
      devtools?.debugger.paused({
        turn: turnIndex,
        point: 'loop_cleanup',
        frameDepth: 0,
        messagesCount: messages.length,
        tokenUsage: lastTokenUsage,  
      })

      return true
    }, `Agent loop cleanup at turn ${turnIndex}`)
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
