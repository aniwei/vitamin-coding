import type { ToolCall } from '@x-mars/ai'
import type { AgentTool } from './types'

export function isToolCallReadOnly(tool: AgentTool | undefined, toolCall: ToolCall): boolean {
  if (!tool) {
    return false
  }
  return resolveToolReadOnly(tool, toolCall.arguments)
}

export function isToolCallConcurrencySafe(
  tool: AgentTool | undefined,
  toolCall: ToolCall,
): boolean {
  if (!tool) {
    return false
  }

  const args = toolCall.arguments
  if (tool.isConcurrencySafe) {
    return safeResolve(() => tool.isConcurrencySafe?.(args) === true)
  }

  return resolveToolReadOnly(tool, args)
}

export function resolveToolReadOnly(tool: AgentTool, args: Record<string, unknown>): boolean {
  if (tool.isReadOnly) {
    return safeResolve(() => tool.isReadOnly?.(args) === true)
  }

  const legacyReadonly = tool.readonly
  if (typeof legacyReadonly === 'function') {
    return safeResolve(() => legacyReadonly(args) === true)
  }

  return legacyReadonly === true
}

function safeResolve(resolve: () => boolean): boolean {
  try {
    return resolve()
  } catch {
    return false
  }
}
