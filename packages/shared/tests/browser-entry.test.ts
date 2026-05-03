import { describe, expect, it } from 'vitest'
import { TypedEventEmitter } from '../src/browser/event-emitter'
import { Subscription } from '../src/browser/subscription'
import {
  TypedEventEmitter as BrowserTypedEventEmitter,
  Subscription as BrowserSubscription,
  BusSubscription,
} from '../src/browser'

interface BrowserEvents {
  ready: (value: boolean) => void
  update: (id: string, count: number) => void
  '*': (type: string, ...args: unknown[]) => void
  [key: string]: (...args: unknown[]) => void
}

describe('shared browser entry', () => {
  it('#event-emitter works in browser entry', () => {
    const emitter = new TypedEventEmitter<BrowserEvents>()
    const values: boolean[] = []
    emitter.on('ready', (value: boolean) => values.push(value))

    emitter.emit('ready', true)

    expect(values).toEqual([true])
  })

  it('#subscription wildcard publish works in browser entry', () => {
    const subscription = new Subscription<BrowserEvents>()
    const received: unknown[] = []
    subscription.subscribeAll((...args: unknown[]) => received.push(args))

    subscription.publish({ update: ['task-1', 2] })

    expect(received).toEqual([['update', 'task-1', 2]])
  })

  it('#browser barrel exports event APIs', () => {
    expect(BrowserTypedEventEmitter).toBe(TypedEventEmitter)
    expect(BrowserSubscription).toBe(Subscription)

    const bus = new BusSubscription<BrowserEvents>()
    const received: unknown[] = []
    bus.subscribe('update', (...args: unknown[]) => received.push(args))
    bus.publish({ update: ['task-2', 3] })

    expect(received).toEqual([['task-2', 3]])
  })
})
