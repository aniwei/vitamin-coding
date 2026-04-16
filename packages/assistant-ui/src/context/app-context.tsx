import { createContext, useContext, useRef } from 'react'
import { createStore } from 'zustand/vanilla'
import { Events, Subscription } from '@vitamin/shared/browser'
import type { StateCreator } from 'zustand'

interface EventBusShape extends Events {

}

class EventBus extends Subscription<EventBusShape> {}

type SliceFromInjection = {}
type Shape = SliceFromInjection
type CreateStoreOptions = {
  injectStoreSlice?: StateCreator<SliceFromInjection>
}

export const createAppStore = (options: CreateStoreOptions) => {
  const { injectStoreSlice } = options || {}

  return createStore<Shape>((...args: Parameters<StateCreator<SliceFromInjection>>) => ({
    eventBus: new EventBus(),
    ...(injectStoreSlice?.(...args) || {} as SliceFromInjection),
  }))
}

type Store = ReturnType<typeof createAppStore>
export const AppContext = createContext<Store | null>(null)

type AppProviderProps = {
  children: React.ReactNode
  injectStoreSlice?: StateCreator<SliceFromInjection>
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider')
  }

  return context
}

export const AppContextProvider = ({ children, injectStoreSlice }: AppProviderProps) => {
  const storeRef = useRef<Store | undefined>(undefined)

  if (!storeRef.current) {
    storeRef.current = createAppStore({ injectStoreSlice })
  }

  return (
    <AppContext.Provider value={storeRef.current}>
      {children}
    </AppContext.Provider>
  )
}
