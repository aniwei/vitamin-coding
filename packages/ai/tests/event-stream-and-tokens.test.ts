// EventStream + token-counter 覆盖率测试
import { describe, expect, it } from 'vitest'

import { createEventStream, EventStream } from '../src/utils/event-stream'
import { estimateTokenCount, estimateMessagesTokens } from '../src/utils/token-counter'

// ═══ EventStream 测试 ═══

describe('EventStream', () => {
  describe('#given a new stream', () => {
    describe('#when created', () => {
      it('#then isComplete is false', () => {
        const stream = new EventStream<string, string>()
        expect(stream.isComplete).toBe(false)
        expect(stream.lastResult).toBeUndefined()
      })
    })
  })

  describe('#given events pushed before iteration', () => {
    describe('#when iterated', () => {
      it('#then yields buffered events then completes', async () => {
        const stream = createEventStream<string, number>()
        stream.push('a')
        stream.push('b')
        stream.complete(42)

        const collected: string[] = []
        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toEqual(['a', 'b'])
        expect(stream.isComplete).toBe(true)
        expect(stream.lastResult).toBe(42)
        expect(await stream.result()).toBe(42)
      })
    })
  })

  describe('#given events pushed during iteration', () => {
    describe('#when consumer awaits', () => {
      it('#then resolves pushed events', async () => {
        const stream = createEventStream<number, string>()

        const collected: number[] = []
        const iteratePromise = (async () => {
          for await (const event of stream) {
            collected.push(event)
          }
        })()

        // 延迟推送
        await new Promise<void>((r) => setTimeout(r, 5))
        stream.push(1)
        await new Promise<void>((r) => setTimeout(r, 5))
        stream.push(2)
        await new Promise<void>((r) => setTimeout(r, 5))
        stream.complete('done')

        await iteratePromise
        expect(collected).toEqual([1, 2])
        expect(await stream.result()).toBe('done')
      })
    })
  })

  describe('#given a stream that fails', () => {
    describe('#when fail is called', () => {
      it('#then result() rejects with error', async () => {
        const stream = createEventStream<string, string>()
        stream.fail(new Error('boom'))

        await expect(stream.result()).rejects.toThrow('boom')
        expect(stream.isComplete).toBe(true)
      })
    })

    describe('#when iterating and fail is called', () => {
      it('#then iteration rejects', async () => {
        const stream = createEventStream<string, string>()

        // 预先捕获 result() rejection 防止 unhandled rejection
        stream.result().catch(() => {})

        const iteratePromise = (async () => {
          const events: string[] = []
          for await (const event of stream) {
            events.push(event)
          }
          return events
        })()

        await new Promise<void>((r) => setTimeout(r, 5))
        stream.fail(new Error('stream error'))

        await expect(iteratePromise).rejects.toThrow('stream error')
      })
    })
  })

  describe('#given a stream with abort controller', () => {
    describe('#when abort is called', () => {
      it('#then stream fails with aborted error', async () => {
        const stream = createEventStream<string, string>()
        const controller = new AbortController()
        stream.setAbortController(controller)

        stream.abort()

        await expect(stream.result()).rejects.toThrow('aborted')
        expect(stream.isComplete).toBe(true)
      })
    })
  })

  describe('#given a completed stream', () => {
    describe('#when push is called', () => {
      it('#then event is discarded', async () => {
        const stream = createEventStream<string, string>()
        stream.complete('done')
        stream.push('late') // should be silently ignored

        const events: string[] = []
        for await (const event of stream) {
          events.push(event)
        }
        expect(events).toHaveLength(0)
      })
    })

    describe('#when complete is called again', () => {
      it('#then second complete is ignored', async () => {
        const stream = createEventStream<string, number>()
        stream.complete(1)
        stream.complete(2) // ignored

        expect(await stream.result()).toBe(1)
      })
    })
  })
})

// ═══ Token Counter 测试 ═══

describe('estimateTokenCount', () => {
  describe('#given empty string', () => {
    describe('#when estimated', () => {
      it('#then returns 0', () => {
        expect(estimateTokenCount('')).toBe(0)
      })
    })
  })

  describe('#given ASCII text', () => {
    describe('#when estimated', () => {
      it('#then returns ~0.25 per char', () => {
        const count = estimateTokenCount('hello world')
        expect(count).toBeGreaterThan(0)
        expect(count).toBeLessThan(11) // 11 chars * 0.25 ≈ 3
      })
    })
  })

  describe('#given Chinese text', () => {
    describe('#when estimated', () => {
      it('#then returns ~1.5 per character', () => {
        const count = estimateTokenCount('你好世界')
        expect(count).toBe(Math.ceil(4 * 1.5))
      })
    })
  })

  describe('#given mixed text', () => {
    describe('#when estimated', () => {
      it('#then combines estimates', () => {
        const count = estimateTokenCount('Hello 你好')
        expect(count).toBeGreaterThan(0)
      })
    })
  })
})

describe('estimateMessagesTokens', () => {
  describe('#given string content messages', () => {
    describe('#when estimated', () => {
      it('#then includes role overhead + content tokens', () => {
        const tokens = estimateMessagesTokens([
          { role: 'user', content: 'hello' },
        ])
        expect(tokens).toBeGreaterThan(4) // 4 role overhead + content
      })
    })
  })

  describe('#given array content with text parts', () => {
    describe('#when estimated', () => {
      it('#then sums text part tokens', () => {
        const tokens = estimateMessagesTokens([
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'response' },
              { type: 'text', text: 'more' },
            ],
          },
        ])
        expect(tokens).toBeGreaterThan(4)
      })
    })
  })

  describe('#given array content with image parts', () => {
    describe('#when estimated', () => {
      it('#then counts ~1000 tokens per image', () => {
        const tokens = estimateMessagesTokens([
          {
            role: 'user',
            content: [
              { type: 'image', source: {} },
            ],
          },
        ])
        expect(tokens).toBe(4 + 1000) // role overhead + image
      })
    })
  })

  describe('#given multiple messages', () => {
    describe('#when estimated', () => {
      it('#then sums all messages', () => {
        const tokens = estimateMessagesTokens([
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hey' },
        ])
        expect(tokens).toBeGreaterThan(8) // 2 * 4 role overhead + content
      })
    })
  })
})
