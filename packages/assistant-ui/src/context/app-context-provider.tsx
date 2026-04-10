'use client'

import type { FC, ReactNode } from 'react'

import {
  AppContext,
} from '@/context/app-context'
// TODO
// import { env } from '@/env'

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
