import { describe, expect, it } from 'vitest'
import { TypedEventEmitter } from '../src/event-emitter'

interface TestEvents {
  message: (text: string) => void
  count: (n: number) => void
  pair: (a: string, b: number) => void
  [key: string]: (...args: any[]) => void
}

// 创建调用记录器，替代 vi.fn()
function createCallTracker<T extends unknown[]>(): {
  handler: (...args: T) => void
  calls: T[]
} {
  const calls: T[] = []
  return {
    handler: (...args: T) => {
      calls.push(args)
    },
    calls,
  }
}

describe('TypedEventEmitter', () => {
  describe('#given a typed emitter', () => {
    describe('#when subscribing with on()', () => {
      it('#then handler receives emitted args', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const { handler, calls } = createCallTracker<[string]>()
        emitter.on('message', handler)
        emitter.emit('message', 'hello')
        expect(calls).toEqual([['hello']])
      })

      it('#then returns an unsubscribe function', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const { handler, calls } = createCallTracker<[string]>()
        const unsub = emitter.on('message', handler)
        unsub()
        emitter.emit('message', 'ignored')
        expect(calls).toEqual([])
      })
    })

    describe('#when subscribing with once()', () => {
      it('#then handler fires only once', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const { handler, calls } = createCallTracker<[number]>()
        emitter.once('count', handler)
        emitter.emit('count', 1)
        emitter.emit('count', 2)
        expect(calls).toHaveLength(1)
        expect(calls[0]).toEqual([1])
      })
    })

    describe('#when using off()', () => {
      it('#then handler is removed', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const { handler, calls } = createCallTracker<[string]>()
        emitter.on('message', handler)
        emitter.off('message', handler)
        emitter.emit('message', 'nope')
        expect(calls).toEqual([])
      })
    })

    describe('#when using removeAllListeners()', () => {
      it('#then all listeners for event are removed', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const tracker1 = createCallTracker<[string]>()
        const tracker2 = createCallTracker<[string]>()
        emitter.on('message', tracker1.handler)
        emitter.on('message', tracker2.handler)
        emitter.removeAllListeners('message')
        emitter.emit('message', 'gone')
        expect(tracker1.calls).toEqual([])
        expect(tracker2.calls).toEqual([])
      })

      it('#then all listeners are removed when no event specified', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const noop = () => {
          // 仅用于计数，不需要处理
        }
        emitter.on('message', noop)
        emitter.on('count', noop)
        emitter.removeAllListeners()
        expect(emitter.listenerCount('message')).toBe(0)
        expect(emitter.listenerCount('count')).toBe(0)
      })
    })

    describe('#when checking listenerCount()', () => {
      it('#then returns correct count', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        expect(emitter.listenerCount('message')).toBe(0)
        const noop1 = () => {
          // 仅用于计数
        }
        const noop2 = () => {
          // 仅用于计数
        }
        emitter.on('message', noop1)
        emitter.on('message', noop2)
        expect(emitter.listenerCount('message')).toBe(2)
      })
    })

    describe('#when emitting with multiple args', () => {
      it('#then all args are passed', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        const { handler, calls } = createCallTracker<[string, number]>()
        emitter.on('pair', handler)
        emitter.emit('pair', 'hello', 42)
        expect(calls).toEqual([['hello', 42]])
      })
    })

    describe('#when emitting with no listeners', () => {
      it('#then does not throw', () => {
        const emitter = new TypedEventEmitter<TestEvents>()
        expect(() => emitter.emit('message', 'nobody cares')).not.toThrow()
      })
    })
  })
})
