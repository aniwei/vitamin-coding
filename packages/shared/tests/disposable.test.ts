import { describe, expect, it } from 'vitest'
import {
  AsyncDisposableStack,
  DisposableStack,
  createAsyncDisposable,
  createDisposable,
} from '../src/disposable'

describe('createDisposable', () => {
  describe('#given a cleanup function', () => {
    it('#then returns a resource with Symbol.dispose', () => {
      let callCount = 0
      const resource = createDisposable(() => {
        callCount++
      })
      resource[Symbol.dispose]()
      expect(callCount).toBe(1)
    })
  })
})

describe('createAsyncDisposable', () => {
  describe('#given an async cleanup function', () => {
    it('#then returns a resource with Symbol.asyncDispose', async () => {
      let callCount = 0
      const resource = createAsyncDisposable(async () => {
        callCount++
      })
      await resource[Symbol.asyncDispose]()
      expect(callCount).toBe(1)
    })
  })
})

describe('DisposableStack', () => {
  describe('#given resources added via use()', () => {
    it('#then disposes in LIFO order', () => {
      const order: number[] = []
      const stack = new DisposableStack()
      stack.use(createDisposable(() => order.push(1)))
      stack.use(createDisposable(() => order.push(2)))
      stack.use(createDisposable(() => order.push(3)))
      stack[Symbol.dispose]()
      expect(order).toEqual([3, 2, 1])
    })
  })

  describe('#given a callback added via defer()', () => {
    it('#then calls cleanup on dispose', () => {
      let callCount = 0
      const stack = new DisposableStack()
      stack.defer(() => {
        callCount++
      })
      stack[Symbol.dispose]()
      expect(callCount).toBe(1)
    })
  })

  describe('#given disposing twice', () => {
    it('#then second dispose is a no-op', () => {
      let callCount = 0
      const stack = new DisposableStack()
      stack.defer(() => {
        callCount++
      })
      stack[Symbol.dispose]()
      stack[Symbol.dispose]()
      expect(callCount).toBe(1)
    })
  })

  describe('#given a disposed stack', () => {
    it('#then use() throws', () => {
      const noop = () => {
        /* noop */
      }
      const stack = new DisposableStack()
      stack[Symbol.dispose]()
      expect(() => stack.use(createDisposable(noop))).toThrow('already been disposed')
    })

    it('#then defer() throws', () => {
      const noop = () => {
        /* noop */
      }
      const stack = new DisposableStack()
      stack[Symbol.dispose]()
      expect(() => stack.defer(noop)).toThrow('already been disposed')
    })
  })

  describe('#given a cleanup that throws', () => {
    it('#then still disposes remaining resources and throws', () => {
      const order: number[] = []
      const stack = new DisposableStack()
      stack.defer(() => order.push(1))
      stack.defer(() => {
        throw new Error('boom')
      })
      stack.defer(() => order.push(3))
      expect(() => stack[Symbol.dispose]()).toThrow('boom')
      expect(order).toEqual([3, 1])
    })

    it('#then aggregates multiple errors', () => {
      const stack = new DisposableStack()
      stack.defer(() => {
        throw new Error('err1')
      })
      stack.defer(() => {
        throw new Error('err2')
      })
      expect(() => stack[Symbol.dispose]()).toThrow('Multiple disposal errors')
    })
  })

  describe('#given isDisposed property', () => {
    it('#then reflects disposal state', () => {
      const stack = new DisposableStack()
      expect(stack.isDisposed).toBe(false)
      stack[Symbol.dispose]()
      expect(stack.isDisposed).toBe(true)
    })
  })
})

describe('AsyncDisposableStack', () => {
  describe('#given async resources', () => {
    it('#then disposes in LIFO order', async () => {
      const order: number[] = []
      const stack = new AsyncDisposableStack()
      stack.defer(async () => { order.push(1) })
      stack.defer(async () => { order.push(2) })
      stack.defer(async () => { order.push(3) })
      await stack[Symbol.asyncDispose]()
      expect(order).toEqual([3, 2, 1])
    })
  })

  describe('#given disposing twice', () => {
    it('#then second dispose is a no-op', async () => {
      let callCount = 0
      const stack = new AsyncDisposableStack()
      stack.defer(async () => {
        callCount++
      })
      await stack[Symbol.asyncDispose]()
      await stack[Symbol.asyncDispose]()
      expect(callCount).toBe(1)
    })
  })
})
