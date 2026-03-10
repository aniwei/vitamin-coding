import { describe, expect, it } from 'vitest'

import { getToolCalls, hasToolCalls } from '../src/types'

import type { AssistantMessage } from '../src/types'

function makeAssistantMessage(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openai',
    model: 'openai/test',
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: 'end_turn',
  }
}

describe('tool call helpers', () => {
  it('detects tool calls', () => {
    const message = makeAssistantMessage([
      { type: 'text', data: 'hello' },
      { type: 'tool_call', id: 't1', name: 'read_file', arguments: { path: 'a' } },
    ])

    expect(hasToolCalls(message)).toBe(true)
    expect(getToolCalls(message)).toHaveLength(1)
    expect(getToolCalls(message)[0]?.name).toBe('read_file')
  })

  it('returns false/empty when no tool calls exist', () => {
    const message = makeAssistantMessage([{ type: 'text', data: 'only text' }])
    expect(hasToolCalls(message)).toBe(false)
    expect(getToolCalls(message)).toEqual([])
  })
})
