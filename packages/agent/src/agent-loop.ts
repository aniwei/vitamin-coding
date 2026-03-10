// Agent 双层循环 — 外循环(FollowUp) + 内循环(工具+Steering)
import { getToolCalls, hasToolCalls } from '@vitamin/ai'

import { AbortError, MaxToolTurnsError } from './errors'

import type { ToolExecutor } from './tool-executor'
import type { AssistantMessage, StreamContext, ToolDefinition, StreamEvent } from '@vitamin/ai'
import type { AgentEvent, AgentLoopConfig, AgentMessage, AgentStatus, AgentTool } from './types'

// Agent 循环的发射器类型
type EmitFn = (event: AgentEvent) => void

// 流式调用函数类型（由外部注入，解耦 ProviderRegistry）
export type StreamFunction = (
  context: StreamContext,
  signal: AbortSignal,
) => AsyncIterable<StreamEvent> & { result(): Promise<AssistantMessage> }

// 循环运行时选项
export interface AgentLoopOptions {
  messages: AgentMessage[]
  config: AgentLoopConfig
  toolExecutor: ToolExecutor
  stream?: StreamFunction
  signal: AbortSignal
  emit: EmitFn
  initialStatus?: AgentStatus
}

// 运行 Agent 双层循环
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

  // 外循环: FollowUp 处理
  while (true) {
    if (signal.aborted) throw new AbortError()

    emit({ type: 'status_change', from: currentStatus, to: 'streaming' })
    currentStatus = 'streaming'

    // 内循环: 工具调用 + Steering
    while (true) {
      if (signal.aborted) throw new AbortError()

      // 安全阀: 最大工具轮次
      if (toolTurnCount > (config.maxToolTurns ?? 25)) {
        throw new MaxToolTurnsError(config.maxToolTurns ?? 25)
      }

      emit({ type: 'turn_start', turnIndex })

      // 1. 上下文转换（压缩/裁剪/注入）
      let contextMessages = [...messages]
      if (config.transformContext) {
        const transformed = await config.transformContext(contextMessages, signal)
        contextMessages = transformed
      }

      // 2. 转换为 LLM 消息格式
      const llmMessages = await config.convertToLlm(contextMessages)

      // 3. 构建工具定义
      const tools = buildToolDefinitions(toolExecutor.getTools())

      // 4. 构建流式上下文
      const streamContext: StreamContext = {
        systemPrompt: config.systemPrompt,
        messages: llmMessages,
        tools: tools.length > 0 ? tools : undefined,
        thinkingLevel: config.thinkingLevel,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      }

      // 5. 流式调用 LLM（通过注入的 streamFn）
      const eventStream = stream(streamContext, signal)

      // 消费流事件
      for await (const event of eventStream) {
        emit({ type: 'stream_event', event })
        if (signal.aborted) throw new AbortError()
      }

      // 获取最终 assistant 消息
      const assistantMessage = await eventStream.result()
      lastAssistantMessage = assistantMessage
      messages.push(assistantMessage as AgentMessage)

      emit({ type: 'turn_end', turnIndex, message: assistantMessage })
      turnIndex++

      // 6. 处理工具调用
      if (hasToolCalls(assistantMessage)) {
        emit({
          type: 'status_change',
          from: currentStatus,
          to: 'tool_executing',
        })
        currentStatus = 'tool_executing'

        const toolCalls = getToolCalls(assistantMessage)

        for (const toolCall of toolCalls) {
          if (signal.aborted) throw new AbortError()

          // 检查 steering 队列
          const steeringMessages = (await config.getSteeringMessages?.()) ?? []
          if (steeringMessages.length > 0) {
            messages.push(...steeringMessages)
            emit({ type: 'steering_injected', messages: steeringMessages })
            break // 中断剩余工具，回到 LLM
          }

          // 执行工具
          emit({
            type: 'tool_call_start',
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            }
          })

          const result = await toolExecutor.execute(toolCall, signal)

          // 构建 ToolResultMessage 并加入消息流
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
        }

        toolTurnCount++

        // 工具执行完毕，回到 streaming
        emit({
          type: 'status_change',
          from: currentStatus,
          to: 'streaming',
        })
        currentStatus = 'streaming'

        continue // 有工具结果 → 继续让 LLM 响应
      }

      // 7. 检查结束条件
      if (assistantMessage.stopReason === 'end_turn') {
        break
      }

      // max_tokens 也需要中断内循环
      if (assistantMessage.stopReason === 'max_tokens') {
        break
      }

      // tool_use 但没有实际工具调用 — 异常，中断
      break
    }

    // 外循环: 检查 FollowUp
    const followUpMessages = (await config.getFollowUpMessages?.()) ?? []
    if (followUpMessages.length > 0) {
      messages.push(...followUpMessages)
      emit({ type: 'follow_up_start', messages: followUpMessages })
      continue
    }

    // 完全结束
    break
  }

  if (!lastAssistantMessage) {
    throw new Error('Agent loop completed without producing a message')
  }

  return lastAssistantMessage
}

// 从 AgentTool 构建 ToolDefinition
function buildToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    visibility: tool.visibility,
  }))
}
