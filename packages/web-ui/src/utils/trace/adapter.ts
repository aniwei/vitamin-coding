/**
 * Adapter: transforms OpenDev ChatMessage JSONL records into the TraceEvent shape
 * that the graph algorithms (buildGraph / collapseGraph) expect.
 */
import type { ContentBlock, OpenDevChatMessage, SessionData, TraceEvent } from '../../types/trace'

function makeUuid(index: number, suffix?: string): string {
  // Deterministic pseudo-uuid from line index for stable graph IDs
  const base = `opendev-${String(index).padStart(6, '0')}`
  return suffix ? `${base}-${suffix}` : base
}

function stringifyResult(result: unknown): string {
  if (result === null || result === undefined) return ''
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

/**
 * Convert an array of OpenDev ChatMessage records into TraceEvent[] + SessionData.
 */
export function adaptOpenDevMessages(
  messages: OpenDevChatMessage[],
  sessionId: string,
): SessionData {
  const events: TraceEvent[] = []
  let prevUuid: string | null = null

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'system') continue

    if (msg.role === 'user') {
      const uuid = makeUuid(i, 'user')
      const contentBlocks: ContentBlock[] = []

      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content })
      }

      events.push({
        uuid,
        parentUuid: prevUuid,
        type: 'user',
        timestamp: msg.timestamp,
        message: {
          role: 'user',
          content: contentBlocks.length > 0 ? contentBlocks : msg.content,
        },
      })
      prevUuid = uuid
    }

    if (msg.role === 'assistant') {
      const uuid = makeUuid(i, 'assistant')
      const contentBlocks: ContentBlock[] = []

      // Add thinking block if present
      if (msg.thinkingTrace) {
        contentBlocks.push({ type: 'thinking', thinking: msg.thinkingTrace })
      }
      if (msg.reasoningContent) {
        contentBlocks.push({ type: 'thinking', thinking: msg.reasoningContent })
      }

      // Add text content
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content })
      }

      // Add tool_use blocks for each tool call
      const toolCalls = msg.toolCalls ?? []
      for (const tc of toolCalls) {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.parameters,
        })
      }

      // Map token usage to the trace-view shape.
      const usage = msg.tokenUsage
        ? {
            inputTokens: (msg.tokenUsage.inputTokens ??
              msg.tokenUsage.promptTokens ??
              0) as number,
            outputTokens: (msg.tokenUsage.outputTokens ??
              msg.tokenUsage.completionTokens ??
              0) as number,
            cacheReadInputTokens: (msg.tokenUsage.cacheReadInputTokens ?? 0) as number,
            cacheCreationInputTokens: (msg.tokenUsage.cacheCreationInputTokens ??
              0) as number,
          }
        : undefined

      events.push({
        uuid,
        parentUuid: prevUuid,
        type: 'assistant',
        timestamp: msg.timestamp,
        message: {
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : msg.content,
          model: (msg.metadata?.model ?? msg.metadata?.provider) as string | undefined,
          usage,
        },
      })
      prevUuid = uuid

      // If there are tool calls, synthesize a "user" event with tool_result blocks
      if (toolCalls.length > 0) {
        const resultUuid = makeUuid(i, 'tool-result')
        const resultBlocks: ContentBlock[] = []

        for (const tc of toolCalls) {
          const resultText = tc.error ? `Error: ${tc.error}` : stringifyResult(tc.result)

          resultBlocks.push({
            type: 'tool_result',
            toolUseId: tc.id,
            content: resultText,
          })
        }

        events.push({
          uuid: resultUuid,
          parentUuid: uuid,
          type: 'user',
          timestamp: msg.timestamp,
          message: {
            role: 'user',
            content: resultBlocks,
          },
        })
        prevUuid = resultUuid
      }
    }
  }

  return {
    sessionId,
    events,
    subagents: {},
  }
}
