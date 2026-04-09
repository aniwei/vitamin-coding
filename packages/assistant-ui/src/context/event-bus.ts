import { createContext, useContext } from 'use-context-selector'
import type { EventEmitter } from 'ahooks/lib/useEventEmitter'

export type EventBusMessage = {
  type: string
  payload?: unknown
  instanceId?: string
}

export type EventBusValue = string | EventBusMessage

export const EventBusContext = createContext<{ eventBus: EventEmitter<EventBusValue> | null }>({
  eventBus: null,
})

export const useEventBusContext = () => useContext(EventBusContext)
