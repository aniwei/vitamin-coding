import { describe, expect, it } from 'vitest'

import { EventStream, createEventStream } from '../src/event-stream'
import { emptyUsage, mergeUsage } from '../src/types'

describe('EventStream', () => {
  it('iterates buffered events and resolves result', async () => {
    const stream = createEventStream<number, string>()
    stream.push(1)
    stream.push(2)
    stream.complete('done')

    const events: number[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events).toEqual([1, 2])
    expect(await stream.result()).toBe('done')
  })

  it('can be constructed directly', () => {
    const stream = new EventStream<string, string>()
    expect(stream.isComplete).toBe(false)
    expect(stream.lastResult).toBeUndefined()
  })
})

describe('usage helpers', () => {
  it('emptyUsage returns zeroed counters', () => {
    expect(emptyUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
  })

  it('mergeUsage adds corresponding counters', () => {
    const merged = mergeUsage(
      { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
      { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
    )

    expect(merged).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadTokens: 33,
      cacheWriteTokens: 44,
    })
  })
}
