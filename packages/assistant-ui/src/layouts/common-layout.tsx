import Header from '@/components/header'
import Splash from '@/components/splash'
import { AppSetup } from '@/components/app-setup'
import { AppContextProvider } from '@/context/app-context-provider'
import { BusEventContextProvider } from '@/context/event-bus-provider'
import { Outlet } from 'react-router-dom'

export const CommonLayout = () => {
  return (
    <>
      <AppSetup>
        <AppContextProvider>
          <BusEventContextProvider>
            <Header />
            <Outlet />
            <Splash />
          </BusEventContextProvider>
        </AppContextProvider>
      </AppSetup>
    </>
  )
}
export default CommonLayout
