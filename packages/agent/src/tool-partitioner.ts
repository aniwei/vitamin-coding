import type { ToolCall } from '@x-mars/ai'
import type { AgentTool } from './types'
import { isToolCallConcurrencySafe } from './tool-capabilities'

export interface ToolBatch {
  isConcurrencySafe: boolean
  toolCalls: ToolCall[]
}

export function partitionToolCalls(toolCalls: ToolCall[], tools: AgentTool[]): ToolBatch[] {
  const toolMap = new Map(tools.map((t) => [t.name, t]))

  return toolCalls.reduce<ToolBatch[]>((batches, toolCall) => {
    const tool = toolMap.get(toolCall.name)
    const isSafe = isToolCallConcurrencySafe(tool, toolCall)

    const lastBatch = batches[batches.length - 1]
    if (isSafe && lastBatch?.isConcurrencySafe) {
      lastBatch.toolCalls.push(toolCall)
    } else {
      batches.push({ isConcurrencySafe: isSafe, toolCalls: [toolCall] })
    }

    return batches
  }, [])
}
