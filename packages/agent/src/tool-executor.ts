import type { ToolCall } from '@vitamin/ai'
import type {
  Devtools,
  PauseResumePayload,
  DebugSnapshot,
  MessageSummaryItem,
} from '@vitamin/devtools'
import type {
  AgentMessage,
  AgentTool,
  ToolExecutionEvent,
  ToolHookExecutor,
  ToolResult,
  ToolSideEffect,
} from './types'
import { resolveToolReadOnly } from './tool-capabilities'
import type { DeferredToolManager } from './deferred-tools'
import { AbortError } from './errors'

type SnapshotMetadata = Record<string, string | number | boolean | null>

// 工具执行器接口
export interface ToolExecutor {
  // 执行单个工具调用
  execute(toolCall: ToolCall, signal: AbortSignal): Promise<ToolResult>

  // 流式执行单个工具调用，产生结构化生命周期事件
  executeStream(toolCall: ToolCall, signal: AbortSignal): AsyncIterable<ToolExecutionEvent>

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
  deferredManager?: DeferredToolManager
  approval?: (toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>
}

// 默认工具执行器实现
class DefaultToolExecutor implements ToolExecutor {
  private readonly tools: Map<string, AgentTool>
  private readonly hookExecutor: ToolHookExecutor | undefined
  private readonly agentName: string
  private readonly sessionId: string
  private readonly devtools: Devtools | undefined
  private readonly deferredManager: DeferredToolManager | undefined
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
    this.deferredManager = options.deferredManager
    this.approval = options.approval
  }

  list(): AgentTool[] {
    return [...this.tools.values()]
  }

  async execute(toolCall: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    return this.executeWithEvents(toolCall, signal, () => {})
  }

  async *executeStream(toolCall: ToolCall, signal: AbortSignal): AsyncIterable<ToolExecutionEvent> {
    const events: ToolExecutionEvent[] = []
    const result = await this.executeWithEvents(toolCall, signal, (event) => {
      events.push(event)
    })

    if (!events.some((event) => event.type === 'result')) {
      events.push({
        type: 'result',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        result,
        durationMs: 0,
        timestamp: Date.now(),
      })
    }

    for (const event of events) {
      yield event
    }
  }

  private async executeWithEvents(
    toolCall: ToolCall,
    signal: AbortSignal,
    emit: (event: ToolExecutionEvent) => void,
  ): Promise<ToolResult> {
    const { id, name } = toolCall
    const tool = this.tools.get(name)
    const startTime = Date.now()
    let args = toolCall.arguments as Record<string, unknown>
    emit({
      type: 'started',
      toolCallId: id,
      toolName: name,
      args,
      timestamp: startTime,
    })

    const finish = (result: ToolResult, sideEffects?: ToolSideEffect[]): ToolResult => {
      emit({
        type: 'result',
        toolCallId: id,
        toolName: name,
        result,
        sideEffects,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      })
      return result
    }

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
      return finish({
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      })
    }

    if (this.deferredManager?.isDeferred(name) && !this.deferredManager.isLoaded(name)) {
      return finish({
        content: [
          {
            type: 'text',
            text: `Tool ${name} is deferred and must be loaded with tool_search before use.`,
          },
        ],
        isError: true,
      })
    }

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
          return finish({
            content: [
              {
                type: 'text',
                text: cancelReason ?? `Tool ${name} was blocked by pre-execution hook`,
              },
            ],
            isError: true,
          })
        }

        // Permission hook 的 'ask' 决策 → 进入审批门控
        if (cancelReason?.startsWith('[CONFIRM]')) {
          const reason = cancelReason.slice('[CONFIRM] '.length)
          emit({
            type: 'approval_required',
            toolCallId: id,
            toolName: name,
            args,
            reason,
            timestamp: Date.now(),
          })
          if (!this.approval) {
            emit({
              type: 'approval_resolved',
              toolCallId: id,
              toolName: name,
              approved: false,
              timestamp: Date.now(),
            })
            return finish({
              content: [
                {
                  type: 'text',
                  text: `Tool ${name} requires approval but no approval handler is configured: ${reason}`,
                },
              ],
              isError: true,
            })
          }
          const approved = await this.approval(name, args, reason)
          emit({
            type: 'approval_resolved',
            toolCallId: id,
            toolName: name,
            approved,
            timestamp: Date.now(),
          })
          if (!approved) {
            return finish({
              content: [{ type: 'text', text: `Tool ${name} was rejected by user: ${reason}` }],
              isError: true,
            })
          }
        }

        // Hook 可能修改了参数
        args = beforeResult.args
      }

      const parsed = tool.parameters.safeParse(args)
      const { success, error } = parsed

      consume(await pause('tool_validate', { valid: success, toolCallId: id }))

      if (!success) {
        return finish({
          content: [{ type: 'text', text: `Invalid arguments for tool ${name}: ${String(error)}` }],
          isError: true,
        })
      }

      if (signal.aborted) {
        return finish({
          content: [{ type: 'text', text: `Tool ${name} execution was aborted` }],
          isError: true,
        })
      }

      // 执行工具
      let result = await tool.execute({
        id: toolCall.id,
        params: parsed.data,
        signal,
        sessionId: this.sessionId || undefined,
        agentName: this.agentName || undefined,
        onUpdate: (update) => {
          emit({
            type: 'progress',
            toolCallId: id,
            toolName: name,
            update,
            timestamp: Date.now(),
          })
        },
      })

      if (signal.aborted) {
        return finish({
          content: [{ type: 'text', text: `Tool ${name} execution was aborted` }],
          isError: true,
        })
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
        return finish({
          content: [{ type: 'text', text: `Tool ${name} execution was aborted` }],
          isError: true,
        })
      }

      return finish(result, extractToolSideEffects(tool, args, result))
    } catch (error) {
      // 工具执行异常 → 包装为 ToolResult { isError: true }
      const message = error instanceof Error ? error.message : String(error)
      emit({
        type: 'error',
        toolCallId: id,
        toolName: name,
        message,
        timestamp: Date.now(),
      })
      return finish({
        content: [{ type: 'text', text: `Tool ${toolCall.name} failed: ${message}` }],
        isError: true,
        details: {
          error: error instanceof Error ? error.name : 'UnknownError',
        },
      })
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
    deferredManager?: DeferredToolManager
    approval?: (toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>
  },
): ToolExecutor {
  return new DefaultToolExecutor({ tools, ...options })
}

function extractToolSideEffects(
  tool: AgentTool,
  args: Record<string, unknown>,
  result: ToolResult,
): ToolSideEffect[] | undefined {
  const resultSideEffects = normalizeResultSideEffects(result.details?.sideEffects)
  if (resultSideEffects.length > 0) {
    return resultSideEffects
  }

  if (isReadonlyTool(tool, args)) {
    return undefined
  }

  const fileTargets = extractStringValues(args, [
    'path',
    'filePath',
    'filename',
    'targetPath',
    'outputPath',
    'oldPath',
    'newPath',
    'files',
    'paths',
  ])
  const urlTargets = extractStringValues(args, ['url', 'urls', 'uri', 'endpoint'])
  const commandTargets = extractStringValues(args, ['command', 'cmd', 'script'])

  const sideEffects: ToolSideEffect[] = []
  const lowerName = tool.name.toLowerCase()

  if (fileTargets.length > 0) {
    sideEffects.push({
      type: 'file',
      action: inferFileAction(lowerName),
      targets: fileTargets,
      reversible: true,
      source: 'arguments',
    })
  }

  if (urlTargets.length > 0) {
    sideEffects.push({
      type: 'network',
      action: 'request',
      targets: urlTargets,
      reversible: false,
      source: 'arguments',
    })
  }

  if (commandTargets.length > 0 || lowerName.includes('shell') || lowerName.includes('bash')) {
    sideEffects.push({
      type: 'process',
      action: 'execute',
      targets: commandTargets.length > 0 ? commandTargets : [tool.name],
      reversible: false,
      source: 'arguments',
    })
  }

  return sideEffects.length > 0 ? sideEffects : undefined
}

function normalizeResultSideEffects(value: unknown): ToolSideEffect[] {
  if (!Array.isArray(value)) {
    return []
  }

  const sideEffects: ToolSideEffect[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    const type = normalizeSideEffectType(record.type)
    const action = typeof record.action === 'string' ? record.action : 'unknown'
    const targets = Array.isArray(record.targets)
      ? record.targets.filter((target): target is string => typeof target === 'string')
      : []

    if (targets.length === 0) {
      continue
    }

    sideEffects.push({
      type,
      action,
      targets,
      reversible: typeof record.reversible === 'boolean' ? record.reversible : false,
      source: 'result',
      metadata:
        record.metadata && typeof record.metadata === 'object'
          ? { ...(record.metadata as Record<string, unknown>) }
          : undefined,
    })
  }

  return sideEffects
}

function normalizeSideEffectType(value: unknown): ToolSideEffect['type'] {
  return value === 'file' || value === 'network' || value === 'process' || value === 'unknown'
    ? value
    : 'unknown'
}

function isReadonlyTool(tool: AgentTool, args: Record<string, unknown>): boolean {
  return resolveToolReadOnly(tool, args)
}

function extractStringValues(args: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = []
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      values.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) {
          values.push(item)
        }
      }
    }
  }
  return [...new Set(values)]
}

function inferFileAction(toolName: string): string {
  if (toolName.includes('delete') || toolName.includes('remove') || toolName.includes('rm')) {
    return 'delete'
  }
  if (toolName.includes('rename') || toolName.includes('move') || toolName.includes('mv')) {
    return 'move'
  }
  if (toolName.includes('edit') || toolName.includes('patch')) {
    return 'edit'
  }
  return 'write'
}
