import Header from '@/components/header'
import Splash from '@/components/splash'
import { AppSetup } from '@/components/app-setup'
import { AppContextProvider } from '@/context/app-context'
import { Outlet } from 'react-router-dom'

export const CommonLayout = () => {
  return (
    <>
      <AppSetup>
        <AppContextProvider>
          <Header />
          <Outlet />
          <Splash />
        </AppContextProvider>
      </AppSetup>
    </>
  )
}
export default CommonLayout
