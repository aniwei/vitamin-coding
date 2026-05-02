import { describe, expect, it } from 'vitest'
import { prune } from '../src/prune'
import { estimateTokens } from '../src/token-estimator'

import type { Message, ToolResultMessage } from '@x-mars/ai'

function userMsg(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
}

function toolResult(toolName: string, text: string): ToolResultMessage {
  return {
    role: 'tool_result',
    toolCallId: `tc_${Math.random()}`,
    toolName,
    content: [{ type: 'text', text }],
    details: null,
    isError: false,
    timestamp: Date.now(),
  }
}

function assistantWithToolCall(toolName: string, args: Record<string, unknown>): Message {
  return {
    role: 'assistant',
    content: [
      { type: 'tool_call', id: 'tc_1', name: toolName, arguments: args },
    ],
  } as unknown as Message
}

// Use a small context window so tests are predictable
const SMALL_WINDOW = 200

describe('prune', () => {
  it('#given messages below trigger threshold #then returns unchanged', () => {
    const messages = [userMsg('short')]
    const result = prune(messages, SMALL_WINDOW, {
      trigger: ['tokens', 99999],
      protect: ['tokens', 10],
      minimum: 1,
    })

    expect(result.changed).toBe(false)
    expect(result.prunedCount).toBe(0)
    expect(result.tokensSaved).toBe(0)
    expect(result.messages).toHaveLength(1)
  })

  it('#given tool_result with large output beyond protect boundary #then prunes it', () => {
    const largeOutput = 'x'.repeat(2000)
    const messages: Message[] = [
      userMsg('start'),
      toolResult('read', largeOutput),
      userMsg('recent message'),
    ]

    const result = prune(messages, SMALL_WINDOW, {
      trigger: ['tokens', 10],
      protect: ['tokens', 10],
      minimum: 1,
    })

    expect(result.changed).toBe(true)
    expect(result.prunedCount).toBeGreaterThan(0)
    expect(result.tokensSaved).toBeGreaterThan(0)

    // The pruned tool_result should contain the placeholder text
    const prunedMsg = result.messages.find(
      m => m.role === 'tool_result' && (m as ToolResultMessage).content[0]?.text.includes('[output pruned'),
    )
    expect(prunedMsg).toBeDefined()
  })

  it('#given savings below minimum #then returns unchanged', () => {
    const messages: Message[] = [
      userMsg('start'),
      toolResult('read', 'tiny'),
      userMsg('end'),
    ]

    const result = prune(messages, SMALL_WINDOW, {
      trigger: ['tokens', 1],
      protect: ['tokens', 1],
      minimum: 999999,
    })

    expect(result.changed).toBe(false)
    expect(result.prunedCount).toBe(0)
  })

  it('#given protectedTools #then does not prune those tools', () => {
    const largeOutput = 'x'.repeat(2000)
    const messages: Message[] = [
      userMsg('start'),
      toolResult('special_tool', largeOutput),
      userMsg('end'),
    ]

    const result = prune(messages, SMALL_WINDOW, {
      trigger: ['tokens', 1],
      protect: ['tokens', 1],
      minimum: 1,
      protectedTools: ['special_tool'],
    })

    // special_tool should NOT be pruned
    const specialMsg = result.messages.find(
      m => m.role === 'tool_result' && (m as ToolResultMessage).toolName === 'special_tool',
    ) as ToolResultMessage
    expect(specialMsg.content[0].text).toBe(largeOutput)
  })

  it('#given truncateTools with large arguments #then truncates tool_call arguments', () => {
    const largeArgs = { data: 'y'.repeat(3000) }
    const messages: Message[] = [
      assistantWithToolCall('write', largeArgs),
      toolResult('write', 'x'.repeat(2000)),
      userMsg('recent'),
    ]

    const result = prune(messages, SMALL_WINDOW, {
      trigger: ['tokens', 1],
      protect: ['tokens', 1],
      minimum: 1,
      truncateTools: ['write'],
      truncateMaxLength: 50,
    })

    expect(result.changed).toBe(true)
  })
})
