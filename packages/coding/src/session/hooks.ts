import type { ToolHookExecutor, ToolResult } from '@vitamin/agent'
import type { HookRegistry } from '@vitamin/hooks'

interface ToolHookOptions {
  hookRegistry: HookRegistry
  agentName: string
  sessionId: string
}

export function createToolHookExecutor(options: ToolHookOptions): ToolHookExecutor {
  const { hookRegistry, agentName, sessionId } = options

  return {
    async executeBeforeHooks(input) {
      const output = {
        args: input.args,
        cancelled: false,
        cancelReason: undefined as string | undefined,
      }

      await hookRegistry.execute('tool.execute.before', {
        ...input,
        agentName,
        sessionId,
      }, output)

      return output
    },

    async executeAfterHooks(input) {
      const output: { result: ToolResult; metadata: Record<string, unknown> } = {
        result: input.result,
        metadata: {},
      }

      await hookRegistry.execute('tool.execute.after', {
        ...input,
        agentName,
        sessionId,
      }, output)

      return output
    },
  }
}