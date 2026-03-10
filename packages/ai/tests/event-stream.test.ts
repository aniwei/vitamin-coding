// @vitamin/ai EventStream 测试
import { describe, expect, it } from 'vitest'
import { createEventStream } from '../src/event-stream'

describe('EventStream', () => {
  describe('#given a new EventStream', () => {
    describe('#when push events and complete', () => {
      it('#then for-await-of yields all events', async () => {
        const stream = createEventStream<number, string>()

        // 异步推送
        setTimeout(() => {
          stream.push(1)
          stream.push(2)
          stream.push(3)
          stream.complete('done')
        }, 10)

        const collected: number[] = []
        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toEqual([1, 2, 3])
      })

      it('#then result() resolves with final value', async () => {
        const stream = createEventStream<number, string>()

        setTimeout(() => {
          stream.push(1)
          stream.complete('final')
        }, 10)

        const result = await stream.result()
        expect(result).toBe('final')
      })
    })

    describe('#when fail is called', () => {
      it('#then result() rejects with error', async () => {
        const stream = createEventStream<number, string>()

        setTimeout(() => {
          stream.fail(new Error('test error'))
        }, 10)

        await expect(stream.result()).rejects.toThrow('test error')
      })
    })

    describe('#when events are pushed before consumption', () => {
      it('#then buffered events are yielded first', async () => {
        const stream = createEventStream<number, string>()

        // 先推送再消费
        stream.push(10)
        stream.push(20)
        stream.complete('buffered')

        const collected: number[] = []
        for await (const event of stream) {
          collected.push(event)
        }

        expect(collected).toEqual([10, 20])
        expect(stream.isComplete).toBe(true)
      })
    })

    describe('#when lastResult is accessed after completion', () => {
      it('#then returns the cached result', () => {
        const stream = createEventStream<number, string>()
        stream.complete('cached')

        expect(stream.lastResult).toBe('cached')
      })
    })

    describe('#when abort is called', () => {
      it('#then result() rejects', async () => {
        const stream = createEventStream<number, string>()
        stream.abort()

        await expect(stream.result()).rejects.toThrow('aborted')
      })
    })
  })
})
