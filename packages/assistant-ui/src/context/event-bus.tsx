import { useEventEmitter } from 'ahooks'
import { createContext, useContext } from 'use-context-selector'
import type { EventEmitter } from 'ahooks/lib/useEventEmitter'
import type { ReactNode } from 'react'

export type EventBusMessage = {
  type: string
  payload?: unknown
  instanceId?: string
}

export type EventBusValue = string | EventBusMessage
export const EventBus = createContext<EventEmitter<EventBusValue> | null >(null)
export const useEventBus = () => useContext(EventBus)

type EventBusContextProviderProps = {
  children: ReactNode
}

export const EventBusContextProvider = ({
  children,
}: EventBusContextProviderProps) => {
  const eventBus = useEventEmitter<EventBusValue>()

  return (
    <EventBus.Provider value={eventBus}>
      {children}
    </EventBus.Provider>
  )
}