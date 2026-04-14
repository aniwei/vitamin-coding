import type { ToolCall } from '@vitamin/ai'
import type {
  Devtools,
  PauseResumePayload,
  DebugSnapshot,
  MessageSummaryItem,
} from '@vitamin/devtools'
import type { AgentMessage, AgentTool, ToolHookExecutor, ToolResult } from './types'
import { AbortError } from './errors'

type SnapshotMetadata = Record<string, string | number | boolean | null>

// 工具执行器接口
export interface ToolExecutor {
  // 执行单个工具调用
  execute(toolCall: ToolCall, signal: AbortSignal): Promise<ToolResult>

  // 顺序模式: 逐个执行，支持 steering 中断
  executeSequential(
    toolCalls: ToolCall[],
    signal: AbortSignal,
    onResult: (toolCall: ToolCall, result: ToolResult) => void,
    checkSteering: () => Promise<AgentMessage[]>,
  ): Promise<{ results: Map<string, ToolResult>; steeringMessages: AgentMessage[] }>

  // 并行模式: 同时执行
  executeParallel(toolCalls: ToolCall[], signal: AbortSignal): Promise<Map<string, ToolResult>>

  // 获取注册的工具列表
  list(): AgentTool[]
}

// 工具执行器选项
export interface ToolExecutorOptions {
  tools: AgentTool[]
  hookExecutor?: ToolHookExecutor
  agentName?: string
  sessionId?: string
  devtools?: Devtools
  approval?: (toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>
}

// 默认工具执行器实现
class DefaultToolExecutor implements ToolExecutor {
  private readonly tools: Map<string, AgentTool>
  private readonly hookExecutor: ToolHookExecutor | undefined
  private readonly agentName: string
  private readonly sessionId: string
  private readonly devtools: Devtools | undefined
  private readonly approval:
    | ((toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>)
    | undefined

  constructor(options: ToolExecutorOptions) {
    this.tools = new Map()
    for (const tool of options.tools) {
      this.tools.set(tool.name, tool)
    }
    this.hookExecutor = options.hookExecutor
    this.agentName = options.agentName ?? ''
    this.sessionId = options.sessionId ?? ''
    this.devtools = options.devtools
    this.approval = options.approval
  }

  list(): AgentTool[] {
    return [...this.tools.values()]
  }

  async execute(toolCall: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    const { id, name } = toolCall
    const tool = this.tools.get(name)
    const emptySummary: MessageSummaryItem[] = []
    const pause = (point: DebugSnapshot['point'], metadata: SnapshotMetadata) =>
      this.devtools?.debugger.pause({
        turn: 0,
        point,
        frameDepth: 2,
        messagesCount: 0,
        lastToolName: name,
        tokenUsage: { input: 0, output: 0 },
        metadata,
        systemPrompt: '',
        messagesSummary: emptySummary,
        llmParams: {},
      })

    const consume = (
      result: { command: { type: string }; payload: PauseResumePayload | null } | undefined,
    ): void => {
      if (!result) {
        return
      }
      if (result.command.type === 'stop') {
        throw new AbortError('Stopped by debugger')
      }
    }

    consume(await pause('tool_resolve', { found: !!tool, toolCallId: id }))

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }

    const startTime = Date.now()
    let args = toolCall.arguments as Record<string, unknown>

    try {
      if (this.hookExecutor) {
        consume(await pause('tool_hook_before', { toolCallId: id }))

        const beforeResult = await this.hookExecutor.executeBeforeHooks({
          toolName: name,
          toolCallId: id,
          args,
          agentName: this.agentName,
          sessionId: this.sessionId,
        })

        const { cancelled, cancelReason } = beforeResult

        if (cancelled) {
          return {
            content: [
              {
                type: 'text',
                text: cancelReason ?? `Tool ${name} was blocked by pre-execution hook`,
              },
            ],
            isError: true,
          }
        }

        // Permission hook 'ask' decision → approval gate
        if (cancelReason?.startsWith('[CONFIRM]') && this.approval) {
          const reason = cancelReason.slice('[CONFIRM] '.length)
          const approved = await this.approval(name, args, reason)
          if (!approved) {
            return {
              content: [{ type: 'text', text: `Tool ${name} was rejected by user: ${reason}` }],
              isError: true,
            }
          }
        }

        // Hook 可能修改了参数
        args = beforeResult.args
      }

      const parsed = tool.parameters.safeParse(args)
      const { success, error } = parsed

      consume(await pause('tool_validate', { valid: success, toolCallId: id }))

      if (!success) {
        return {
          content: [{ type: 'text', text: `Invalid arguments for tool ${name}: ${String(error)}` }],
          isError: true,
        }
      }

      if (signal.aborted) {
        return {
          content: [{ type: 'text', text: `Tool ${name} execution was aborted` }],
          isError: true,
        }
      }

      // 执行工具
      let result = await tool.execute({
        id: toolCall.id,
        params: parsed.data,
        signal,
        sessionId: this.sessionId || undefined,
        agentName: this.agentName || undefined,
      })

      if (signal.aborted) {
        return {
          content: [{ type: 'text', text: `Tool ${name} execution was aborted` }],
          isError: true,
        }
      }

      // tool.execute.after Hook 管线
      if (this.hookExecutor) {
        const afterResult = await this.hookExecutor.executeAfterHooks({
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          args,
          result,
          agentName: this.agentName,
          sessionId: this.sessionId,
          durationMs: Date.now() - startTime,
        })

        result = afterResult.result

        consume(
          await pause('tool_hook_after', { toolCallId: id, durationMs: Date.now() - startTime }),
        )
      }

      if (signal.aborted) {
        return {
          content: [{ type: 'text', text: `Tool ${name} execution was aborted` }],
          isError: true,
        }
      }

      return result
    } catch (error) {
      // 工具执行异常 → 包装为 ToolResult { isError: true }
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Tool ${toolCall.name} failed: ${message}` }],
        isError: true,
        details: {
          error: error instanceof Error ? error.name : 'UnknownError',
        },
      }
    }
  }

  async executeSequential(
    toolCalls: ToolCall[],
    signal: AbortSignal,
    onResult: (toolCall: ToolCall, result: ToolResult) => void,
    checkSteering: () => Promise<AgentMessage[]>,
  ): Promise<{ results: Map<string, ToolResult>; steeringMessages: AgentMessage[] }> {
    const results = new Map<string, ToolResult>()

    for (const toolCall of toolCalls) {
      if (signal.aborted) {
        break
      }

      // 检查 steering 队列
      const steeringMessages = await checkSteering()
      if (steeringMessages.length > 0) {
        return { results, steeringMessages }
      }

      const result = await this.execute(toolCall, signal)
      results.set(toolCall.id, result)
      onResult(toolCall, result)
    }

    return { results, steeringMessages: [] }
  }

  async executeParallel(
    toolCalls: ToolCall[],
    signal: AbortSignal,
  ): Promise<Map<string, ToolResult>> {
    const entries = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const result = await this.execute(toolCall, signal)
        return [toolCall.id, result] as const
      }),
    )

    return new Map(entries)
  }
}

// 工厂函数
export function createToolExecutor(
  tools: AgentTool[],
  options?: {
    hookExecutor?: ToolHookExecutor
    agentName?: string
    sessionId?: string
    devtools?: Devtools
    approval?: (toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>
  },
): ToolExecutor {
  return new DefaultToolExecutor({ tools, ...options })
}
