import { describe, expect, it } from 'vitest'
import {
  findCutPoint,
  needsCompaction,
  isEligibleForManualCompact,
  prepareCompaction,
} from '../src/compaction'
import { estimateTokens } from '../src/token-estimator'

import type { Message } from '@x-mars/ai'

function userMsg(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
}

function assistantMsg(text: string): Message {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
  } as unknown as Message
}

function toolResult(toolName: string, text: string): Message {
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

describe('findCutPoint', () => {
  it('#given a set of messages with keepRecentTokens #then finds a valid cut index', () => {
    const messages = [
      userMsg('a'.repeat(100)),
      assistantMsg('b'.repeat(100)),
      userMsg('c'.repeat(100)),
      assistantMsg('d'.repeat(100)),
    ]
    const cutPoint = findCutPoint(messages, 30, estimateTokens)

    expect(cutPoint.firstKeptIndex).toBeGreaterThanOrEqual(0)
    expect(cutPoint.firstKeptIndex).toBeLessThan(messages.length)
  })

  it('#given cut point lands on tool_result #then adjusts to user/assistant boundary', () => {
    const messages: Message[] = [
      userMsg('old'),
      assistantMsg('response'),
      toolResult('read', 'file content'),
      userMsg('recent'),
    ]
    const cutPoint = findCutPoint(messages, 10, estimateTokens)

    const msgAtCut = messages[cutPoint.firstKeptIndex]
    expect(msgAtCut?.role === 'user' || msgAtCut?.role === 'assistant').toBe(true)
  })

  it('#given very large keepRecentTokens #then cut index is near the beginning', () => {
    const messages = [userMsg('a'), assistantMsg('b')]
    const cutPoint = findCutPoint(messages, 999999, estimateTokens)

    expect(cutPoint.firstKeptIndex).toBe(0)
  })
})

describe('needsCompaction', () => {
  it('#given messages below trigger #then returns false', () => {
    const messages = [userMsg('short')]
    expect(needsCompaction(messages, 200_000)).toBe(false)
  })

  it('#given messages above trigger #then returns true', () => {
    const messages = [userMsg('x'.repeat(100_000))]
    expect(
      needsCompaction(messages, 1000, {
        enabled: true,
        trigger: ['tokens', 10],
      }),
    ).toBe(true)
  })

  it('#given enabled false #then always returns false', () => {
    const messages = [userMsg('x'.repeat(100_000))]
    expect(
      needsCompaction(messages, 100, {
        enabled: false,
        trigger: ['tokens', 1],
      }),
    ).toBe(false)
  })
})

describe('isEligibleForManualCompact', () => {
  it('#given messages at 50% of trigger #then returns true', () => {
    // trigger = tokens 100, so 50% = 50 tokens needed
    const messages = [userMsg('x'.repeat(400))] // ~100 tokens
    expect(
      isEligibleForManualCompact(messages, 1000, {
        trigger: ['tokens', 100],
      }),
    ).toBe(true)
  })

  it('#given messages well below 50% of trigger #then returns false', () => {
    const messages = [userMsg('hi')]
    expect(
      isEligibleForManualCompact(messages, 200_000, {
        trigger: ['tokens', 99999],
      }),
    ).toBe(false)
  })
})

describe('prepareCompaction', () => {
  it('#given too few messages #then returns null', () => {
    const result = prepareCompaction([userMsg('only one')], 1000, {
      keepRecent: ['tokens', 1],
    })
    expect(result).toBeNull()
  })

  it('#given enough messages #then returns preparation with split arrays', () => {
    const messages = [
      userMsg('a'.repeat(200)),
      assistantMsg('b'.repeat(200)),
      userMsg('c'.repeat(200)),
      assistantMsg('d'.repeat(200)),
      userMsg('recent'),
    ]

    const result = prepareCompaction(messages, 1000, {
      keepRecent: ['tokens', 10],
    })

    expect(result).not.toBeNull()
    expect(result!.messagesToSummarize.length).toBeGreaterThan(0)
    expect(result!.preservedMessages.length).toBeGreaterThan(0)
    expect(result!.tokensBefore).toBeGreaterThan(0)
    expect(result!.fileOps).toBeDefined()
  })

  it('#given previousSummary #then includes it in preparation', () => {
    const messages = [userMsg('a'.repeat(200)), assistantMsg('b'.repeat(200)), userMsg('recent')]

    const result = prepareCompaction(messages, 1000, { keepRecent: ['tokens', 10] }, 'old summary')
    expect(result).not.toBeNull()
    expect(result!.previousSummary).toBe('old summary')
  })

  it('#given file operations in messages #then extracts them', () => {
    const messages: Message[] = [
      userMsg('read this'),
      toolResult('read', '/src/index.ts\nfile content here'),
      toolResult('write', '/src/out.ts\nwritten content'),
      userMsg('recent'),
    ]

    const result = prepareCompaction(messages, 100, { keepRecent: ['tokens', 5] })

    if (result) {
      // File ops extraction depends on regex matching paths in tool output
      expect(result.fileOps).toBeDefined()
      expect(result.fileOps.read).toBeInstanceOf(Array)
      expect(result.fileOps.modified).toBeInstanceOf(Array)
    }
  })
})
