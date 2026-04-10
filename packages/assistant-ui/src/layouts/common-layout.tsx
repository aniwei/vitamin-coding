import Header from '@/components/header'
import Splash from '@/components/splash'
import { AppSetup } from '@/components/app-setup'
import { AppContextProvider } from '@/context/app-context-provider'
import { BusEventContextProvider } from '@/context/event-bus-provider'
import type { ReactNode } from 'react'

export const CommonLayout = ({ children }: { children?: ReactNode }) => {
  return (
    <>
      <AppSetup>
        <AppContextProvider>
          <BusEventContextProvider>
            <Header />
              {children}
            <Splash />
          </BusEventContextProvider>
        </AppContextProvider>
      </AppSetup>
    </>
  )
}
export default CommonLayout
