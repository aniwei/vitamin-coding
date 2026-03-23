import { createLogger } from './logger'
import { TypedEventEmitter } from './event-emitter'
import type { Events } from './event-emitter'

const logger = createLogger('@vitamin/shared:bus')

type UnSubscribe = () => void

interface SubscribeEvent extends Events {
  [event: string]: (...args: unknown[]) => void
}

export class BusSubscription extends TypedEventEmitter<SubscribeEvent> {
  publish(event: Record<string, unknown[]>) {
    logger.debug(`Publishing event: ${Object.keys(event).join(', ')}`)
    for (const [type, args] of Object.entries(event)) {
      this.emit(type, ...args)
      this.emit('*', type, args)
    }
  }

  subscribe<K extends keyof SubscribeEvent>(
    type: K,
    callback: SubscribeEvent[K],
    once: boolean = false,
  ): UnSubscribe {
    logger.debug(`Subscribing to event: ${type}`)

    once ? this.once(type, callback) : this.on(type, callback)
    return () => {
      logger.debug(`Unsubscribing from event: ${type}`)
      this.off(type, callback)
    }
  }

  subscribeAll(callback: (...args: unknown[]) => void): () => void {
    return this.subscribe('*', callback)
  }
}
