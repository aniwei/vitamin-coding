import type { FC, ReactNode } from 'react'
import {
  createContext,
  useContext,
  useContextSelector,
} from 'use-context-selector'

export type AppContextValue = {

}

export const AppContext = createContext<AppContextValue>({

})

export function useSelector<T>(selector: (value: AppContextValue) => T): T {
  return useContextSelector(AppContext, selector)
}

export const useAppContext = () => useContext(AppContext)

interface AppContextProviderProps {
  children: ReactNode
}

export const AppContextProvider: FC<AppContextProviderProps> = ({ children }) => {
  return (
    <AppContext.Provider value={{

    }}
    >
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="relative flex grow flex-col overflow-y-auto overflow-x-hidden bg-background-body">
          {children}
        </div>
      </div>
    </AppContext.Provider>
  )
}