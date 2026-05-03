import { describe, expect, it } from 'vitest'
import {
  estimateTokens,
  messageToText,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateContextTokens,
} from '../src/token-estimator'

import type { Message, AssistantMessage } from '@x-mars/ai'

function userMsg(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
}

function assistantMsg(
  text: string,
  usage?: { inputTokens: number; outputTokens: number },
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'messages',
    provider: 'anthropic',
    model: 'test',
    usage: usage ?? { inputTokens: 0, outputTokens: 0 },
    stopReason: 'end_turn',
  } as AssistantMessage
}

function toolResultMsg(toolName: string, text: string): Message {
  return {
    role: 'tool_result',
    toolCallId: 'tc_1',
    toolName,
    content: [{ type: 'text', text }],
    details: null,
    isError: false,
    timestamp: Date.now(),
  }
}

describe('estimateTokens', () => {
  it('#given an empty string #then returns 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('#given a short string #then estimates ~length/4', () => {
    const result = estimateTokens('hello world')
    expect(result).toBe(Math.ceil('hello world'.length / 4))
  })

  it('#given a long string #then scales linearly', () => {
    const text = 'a'.repeat(1000)
    expect(estimateTokens(text)).toBe(250)
  })
})

describe('messageToText', () => {
  it('#given a user message with text content parts #then joins text', () => {
    const msg = userMsg('hello')
    expect(messageToText(msg)).toBe('hello')
  })

  it('#given an assistant message with tool_call #then formats as name(args)', () => {
    const msg: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'calling tool' },
        { type: 'tool_call', id: 'tc_1', name: 'read', arguments: { path: '/foo' } },
      ],
    } as unknown as Message
    const text = messageToText(msg)
    expect(text).toContain('calling tool')
    expect(text).toContain('read(')
    expect(text).toContain('/foo')
  })

  it('#given an image content #then returns [image]', () => {
    const msg: Message = {
      role: 'user',
      content: [{ type: 'image', source: 'data:image/png;base64,...' }],
      timestamp: Date.now(),
    } as unknown as Message
    expect(messageToText(msg)).toBe('[image]')
  })

  it('#given a string content #then returns content directly', () => {
    const msg = { role: 'user', content: 'plain text', timestamp: Date.now() } as unknown as Message
    expect(messageToText(msg)).toBe('plain text')
  })
})

describe('estimateMessageTokens', () => {
  it('#given a message #then adds role overhead of 4', () => {
    const msg = userMsg('test')
    const textTokens = estimateTokens('test')
    expect(estimateMessageTokens(msg)).toBe(textTokens + 4)
  })

  it('#given a custom estimator #then uses it', () => {
    const msg = userMsg('hello')
    const result = estimateMessageTokens(msg, () => 10)
    expect(result).toBe(14) // 10 + 4 overhead
  })
})

describe('estimateMessagesTokens', () => {
  it('#given an empty array #then returns 0', () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })

  it('#given multiple messages #then sums individual estimates', () => {
    const msgs = [userMsg('a'), userMsg('b')]
    const total = estimateMessagesTokens(msgs)
    expect(total).toBe(estimateMessageTokens(msgs[0]) + estimateMessageTokens(msgs[1]))
  })
})

describe('estimateContextTokens', () => {
  it('#given messages without usage #then estimates all from text', () => {
    const msgs = [userMsg('hello'), userMsg('world')]
    const result = estimateContextTokens(msgs)

    expect(result.lastUsageIndex).toBe(-1)
    expect(result.fromUsage).toBe(0)
    expect(result.fromEstimate).toBe(estimateMessagesTokens(msgs))
    expect(result.total).toBe(result.fromEstimate)
  })

  it('#given an assistant message with usage #then uses usage as base', () => {
    const msgs: Message[] = [
      userMsg('hello'),
      assistantMsg('response', { inputTokens: 100, outputTokens: 50 }),
    ]

    const result = estimateContextTokens(msgs)
    expect(result.lastUsageIndex).toBe(1)
    expect(result.fromUsage).toBe(150) // inputTokens + outputTokens
    expect(result.fromEstimate).toBe(0) // no trailing messages
    expect(result.total).toBe(150)
  })

  it('#given trailing messages after usage #then adds estimated trailing', () => {
    const msgs: Message[] = [
      userMsg('hello'),
      assistantMsg('response', { inputTokens: 100, outputTokens: 50 }),
      userMsg('follow-up'),
    ]

    const result = estimateContextTokens(msgs)
    expect(result.lastUsageIndex).toBe(1)
    expect(result.fromUsage).toBe(150)
    expect(result.fromEstimate).toBeGreaterThan(0)
    expect(result.total).toBe(150 + result.fromEstimate)
  })
})
