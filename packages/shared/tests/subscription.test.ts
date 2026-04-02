import { describe, expect, it } from 'vitest'
import { Subscription } from '../src/subscrption'
import { BusSubscription } from '../src/bus-subscrption'

describe('Subscription', () => {
  it('#publish dispatches events by type', () => {
    const sub = new Subscription()
    const received: unknown[] = []
    sub.subscribe('greeting', (msg: unknown) => received.push(msg))
    sub.publish({ greeting: ['hello'] })
    expect(received).toEqual(['hello'])
  })

  it('#publish also emits wildcard event', () => {
    const sub = new Subscription()
    const received: unknown[] = []
    sub.subscribeAll((...args: unknown[]) => received.push(args))
    sub.publish({ test: [42] })
    expect(received.length).toBe(1)
    expect(received[0]).toEqual(['test', 42])
  })

  it('#subscribe returns unsubscribe function', () => {
    const sub = new Subscription()
    const received: unknown[] = []
    const unsub = sub.subscribe('x', (v: unknown) => received.push(v))
    sub.publish({ x: [1] })
    unsub()
    sub.publish({ x: [2] })
    expect(received).toEqual([1])
  })

  it('#subscribe with once=true fires only once', () => {
    const sub = new Subscription()
    const received: unknown[] = []
    sub.subscribe('y', (v: unknown) => received.push(v), true)
    sub.publish({ y: [1] })
    sub.publish({ y: [2] })
    expect(received).toEqual([1])
  })

  it('#publish delivers multi-arg events', () => {
    const sub = new Subscription()
    const received: unknown[] = []
    sub.subscribe('multi', (...args: unknown[]) => received.push(args))
    sub.publish({ multi: ['a', 'b', 'c'] })
    expect(received).toEqual([['a', 'b', 'c']])
  })

  it('#publish dispatches multiple event types at once', () => {
    const sub = new Subscription()
    const aValues: unknown[] = []
    const bValues: unknown[] = []
    sub.subscribe('a', (v: unknown) => aValues.push(v))
    sub.subscribe('b', (v: unknown) => bValues.push(v))
    sub.publish({ a: [1], b: [2] })
    expect(aValues).toEqual([1])
    expect(bValues).toEqual([2])
  })
})

describe('BusSubscription', () => {
  it('#extends Subscription and inherits all behavior', () => {
    const bus = new BusSubscription()
    const received: unknown[] = []
    bus.subscribe('event', (v: unknown) => received.push(v))
    bus.publish({ event: ['data'] })
    expect(received).toEqual(['data'])
  })

  it('#subscribeAll works on BusSubscription', () => {
    const bus = new BusSubscription()
    const received: unknown[] = []
    bus.subscribeAll((...args: unknown[]) => received.push(args))
    bus.publish({ foo: [42] })
    expect(received[0]).toEqual(['foo', 42])
  })
})
