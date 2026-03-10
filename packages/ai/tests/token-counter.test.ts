import { describe, expect, it } from 'vitest'

import { emptyUsage, mergeUsage } from '../src/types'

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
})
