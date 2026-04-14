import Header from '@/components/header'
import Splash from '@/components/splash'
import { AppSetup } from '@/components/app-setup'
import { AppContextProvider } from '@/context/app-context'
import { EventBusContextProvider } from '@/context/event-bus'
import { Outlet } from 'react-router-dom'

export const CommonLayout = () => {
  return (
    <>
      <AppSetup>
        <AppContextProvider>
          <EventBusContextProvider>
            <Header />
            <Outlet />
            <Splash />
          </EventBusContextProvider>
        </AppContextProvider>
      </AppSetup>
    </>
  )
}
export default CommonLayout
