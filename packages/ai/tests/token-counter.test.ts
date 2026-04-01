import { describe, expect, it } from 'vitest'

import { emptyUsage, getTokensFromUsage, mergeUsage } from '../src/types'

describe('usage helpers', () => {
  it('emptyUsage returns all zeros', () => {
    expect(emptyUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
  })

  it('mergeUsage sums all fields', () => {
    const usage = mergeUsage(
      { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
      { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
    )

    expect(usage).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadTokens: 33,
      cacheWriteTokens: 44,
    })
  })

  it('getTokensFromUsage returns assistant total tokens', () => {
    expect(
      getTokensFromUsage({
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        api: 'openai-responses',
        provider: 'openai',
        model: 'openai/gpt-4.1',
        usage: {
          inputTokens: 3,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: 'end_turn',
      }),
    ).toBe(7)
  })

  it('getTokensFromUsage returns null for non-assistant messages', () => {
    expect(
      getTokensFromUsage({
        role: 'user',
        content: 'hello',
        timestamp: Date.now(),
      }),
    ).toBeNull()
  })
})
