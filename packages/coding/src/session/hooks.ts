import type { ToolHookExecutor, ToolResult } from '@x-mars/agent'
import type { HookRegistry } from '@x-mars/hooks'

interface ToolHookOptions {
  hookRegistry: HookRegistry
  agentName: string
  sessionId: string
  metadata?: Record<string, unknown>
}

export function createToolHookExecutor(options: ToolHookOptions): ToolHookExecutor {
  const { hookRegistry, agentName, sessionId, metadata } = options

  return {
    async executeBeforeHooks(input) {
      const output = {
        args: input.args,
        cancelled: false,
        cancelReason: undefined as string | undefined,
      }

      await hookRegistry.execute(
        'tool.execute.before',
        {
          ...input,
          agentName,
          sessionId,
          metadata: metadata ? { ...metadata } : undefined,
        },
        output,
      )

      return output
    },

    async executeAfterHooks(input) {
      const output: { result: ToolResult; metadata: Record<string, unknown> } = {
        result: input.result,
        metadata: {},
      }

      await hookRegistry.execute(
        'tool.execute.after',
        {
          ...input,
          agentName,
          sessionId,
          metadata: metadata ? { ...metadata } : undefined,
        },
        output,
      )

      return output
    },
  }
}
