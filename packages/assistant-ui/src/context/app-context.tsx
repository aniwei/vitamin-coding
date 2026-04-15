import { createContext, useRef } from 'react'
import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'

type SliceFromInjection = {}
type Shape = SliceFromInjection
type CreateStoreOptions = {
  injectStoreSlice?: StateCreator<SliceFromInjection>
}

export const createAppStore = (options: CreateStoreOptions) => {
  const { injectStoreSlice } = options || {}

  return createStore<Shape>((...args: Parameters<StateCreator<SliceFromInjection>>) => ({
    ...(injectStoreSlice?.(...args) || {} as SliceFromInjection),
  }))
}


type Store = ReturnType<typeof createAppStore>
export const AppContext = createContext<Store | null>(null)

type AppProviderProps = {
  children: React.ReactNode
  injectStoreSlice?: StateCreator<SliceFromInjection>
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
