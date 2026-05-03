import { describe, expect, it, vi } from 'vitest'
import { timeMicroCompact, cachedMicroCompact, MicroCompactCache } from '../src/micro-compact'
import { estimateTokens } from '../src/token-estimator'

import type { Message, ToolResultMessage } from '@x-mars/ai'

function userMsg(text: string, timestamp?: number): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: timestamp ?? Date.now() }
}

function toolResult(text: string, timestamp?: number): ToolResultMessage {
  return {
    role: 'tool_result',
    toolCallId: `tc_${Math.random()}`,
    toolName: 'read',
    content: [{ type: 'text', text }],
    details: null,
    isError: false,
    timestamp: timestamp ?? Date.now(),
  }
}

function assistantMsg(text: string, timestamp?: number): Message {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    timestamp: timestamp ?? Date.now(),
  } as Message
}

const fiveMinAgo = Date.now() - 6 * 60 * 1000
const oneMinAgo = Date.now() - 60 * 1000

describe('timeMicroCompact', () => {
  it('#given recent tool outputs #then leaves unchanged', () => {
    const messages = [userMsg('hello', oneMinAgo), toolResult('x'.repeat(500), oneMinAgo)]
    const result = timeMicroCompact(messages, { ageThresholdMs: 300_000 })

    expect(result.changed).toBe(false)
    expect(result.foldedCount).toBe(0)
  })

  it('#given old tool outputs #then folds them', () => {
    const messages = [
      userMsg('hello', fiveMinAgo),
      toolResult('x'.repeat(500), fiveMinAgo),
      toolResult('y'.repeat(300), fiveMinAgo),
      userMsg('recent'),
      toolResult('z'.repeat(200), oneMinAgo),
    ]
    const result = timeMicroCompact(messages, {
      ageThresholdMs: 300_000,
      minOutputTokens: 10,
    })

    expect(result.changed).toBe(true)
    expect(result.foldedCount).toBe(2)
    expect(result.tokensSaved).toBeGreaterThan(0)

    const folded1 = (result.messages[1] as ToolResultMessage).content[0] as { text: string }
    expect(folded1.text).toMatch(/^\[output folded — \d+ tokens\]$/)

    expect(result.messages[4]).toBe(messages[4])
  })

  it('#given already folded outputs #then skips them', () => {
    const messages = [
      toolResult('[output folded — 100 tokens]', fiveMinAgo),
      toolResult('[output pruned — 200 tokens]', fiveMinAgo),
    ]
    const result = timeMicroCompact(messages, {
      ageThresholdMs: 300_000,
      minOutputTokens: 1,
    })

    expect(result.changed).toBe(false)
    expect(result.foldedCount).toBe(0)
  })

  it('#given small outputs below minOutputTokens #then skips them', () => {
    const messages = [toolResult('ok', fiveMinAgo)]
    const result = timeMicroCompact(messages, {
      ageThresholdMs: 300_000,
      minOutputTokens: 50,
    })

    expect(result.changed).toBe(false)
  })

  it('#given no timestamps #then treats as current (no fold)', () => {
    const msg: ToolResultMessage = {
      role: 'tool_result',
      toolCallId: 'tc_1',
      toolName: 'read',
      content: [{ type: 'text', text: 'x'.repeat(500) }],
      details: null,
      isError: false,
    }
    const result = timeMicroCompact([msg], {
      ageThresholdMs: 300_000,
      minOutputTokens: 10,
    })

    expect(result.changed).toBe(false)
  })
})

describe('MicroCompactCache', () => {
  it('#then stores and retrieves values', () => {
    const cache = new MicroCompactCache(10)
    cache.set('k1', 'v1')
    expect(cache.get('k1')).toBe('v1')
    expect(cache.size).toBe(1)
  })

  it('#then evicts oldest when full', () => {
    const cache = new MicroCompactCache(2)
    cache.set('k1', 'v1')
    cache.set('k2', 'v2')
    cache.set('k3', 'v3')

    expect(cache.get('k1')).toBeUndefined()
    expect(cache.get('k2')).toBe('v2')
    expect(cache.get('k3')).toBe('v3')
  })

  it('#then LRU refreshes on get', () => {
    const cache = new MicroCompactCache(2)
    cache.set('k1', 'v1')
    cache.set('k2', 'v2')
    cache.get('k1')
    cache.set('k3', 'v3')

    expect(cache.get('k1')).toBe('v1')
    expect(cache.get('k2')).toBeUndefined()
  })

  it('#then clear removes all', () => {
    const cache = new MicroCompactCache(10)
    cache.set('k1', 'v1')
    cache.set('k2', 'v2')
    cache.clear()
    expect(cache.size).toBe(0)
  })
})

describe('cachedMicroCompact', () => {
  const longText = 'x'.repeat(2000)

  function makeMessages(count: number): Message[] {
    return Array.from({ length: count }, (_, i) =>
      i % 2 === 0 ? userMsg(longText) : assistantMsg(longText),
    )
  }

  it('#given context below trigger #then returns unchanged', async () => {
    const messages = [userMsg('hello')]
    const cache = new MicroCompactCache()
    const summarize = vi.fn()

    const result = await cachedMicroCompact(messages, 200_000, summarize, cache, {
      trigger: ['tokens', 99999],
    })

    expect(result.changed).toBe(false)
    expect(summarize).not.toHaveBeenCalled()
  })

  it('#given context above trigger #then summarizes oldest window', async () => {
    const messages = makeMessages(10)
    const cache = new MicroCompactCache()
    const summarize = vi.fn().mockResolvedValue('Summary of conversation')

    const result = await cachedMicroCompact(messages, 200_000, summarize, cache, {
      trigger: ['tokens', 100],
      windowFraction: 0.3,
    })

    expect(result.changed).toBe(true)
    expect(result.cached).toBe(false)
    expect(result.summary).toBe('Summary of conversation')
    expect(summarize).toHaveBeenCalledOnce()

    const firstMsg = result.messages[0]!
    const content = (firstMsg.content as { type: string; text: string }[])[0]!
    expect(content.text).toContain('[Micro Summary]')
    expect(content.text).toContain('Summary of conversation')

    expect(result.messages.length).toBeLessThan(messages.length)
  })

  it('#given same content twice #then uses cache on second call', async () => {
    const messages = makeMessages(10)
    const cache = new MicroCompactCache()
    const summarize = vi.fn().mockResolvedValue('cached summary')
    const opts = { trigger: ['tokens' as const, 100], windowFraction: 0.3 }

    await cachedMicroCompact(messages, 200_000, summarize, cache, opts)
    expect(summarize).toHaveBeenCalledOnce()

    const result2 = await cachedMicroCompact(messages, 200_000, summarize, cache, opts)
    expect(summarize).toHaveBeenCalledOnce()
    expect(result2.cached).toBe(true)
    expect(result2.summary).toBe('cached summary')
  })

  it('#given too few messages in window #then returns unchanged', async () => {
    const messages = [userMsg(longText)]
    const cache = new MicroCompactCache()
    const summarize = vi.fn()

    const result = await cachedMicroCompact(messages, 200_000, summarize, cache, {
      trigger: ['tokens', 1],
      windowFraction: 0.3,
    })

    expect(result.changed).toBe(false)
  })
})
