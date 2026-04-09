import { useEventEmitter } from 'ahooks'
import { EventBusContext } from './event-bus'
import type { ReactNode } from 'react'
import type { EventBusValue } from './event-bus'

type BusEventContextProviderProps = {
  children: ReactNode
}

export const BusEventContextProvider = ({
  children,
}: BusEventContextProviderProps) => {
  const eventBus = useEventEmitter<EventBusValue>()

  return (
    <EventBusContext.Provider value={{ eventBus }}>
      {children}
    </EventBusContext.Provider>
  )
}
