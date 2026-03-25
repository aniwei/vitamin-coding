import { TypedEventEmitter } from './event-emitter'
import type { Events } from './event-emitter'

type UnSubscribe = () => void

interface SubscribeEvent extends Events {
  [event: string]: (...args: unknown[]) => void
}

export class Subscription extends TypedEventEmitter<SubscribeEvent> {
  publish(event: Record<string, unknown[]>) {    
    for (const [type, args] of Object.entries(event)) {
      this.emit(type, ...args)
      this.emit('*', type, ...args)
    }
  }

  subscribe<K extends keyof SubscribeEvent>(
    type: K,
    callback: SubscribeEvent[K],
    once: boolean = false,
  ): UnSubscribe {
    once ? this.once(type, callback) : this.on(type, callback)
    return () => {
      this.off(type, callback)
    }
  }

  subscribeAll(callback: (...args: unknown[]) => void): () => void {
    return this.subscribe('*', callback)
  }
}
