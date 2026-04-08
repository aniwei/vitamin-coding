import { Suspense } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Provider as JotaiProvider } from 'jotai/react'
import { ThemeProvider } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'
import { TanstackQueryInitializer } from '@/context/query-client'
import { ToastHost } from '@/components/base/ui/toast'
import { TooltipProvider } from '@/components/base/ui/tooltip'
import { router } from './routes'
import GlobalPublicStoreProvider from '@/context/global-public-context'

import '@/styles/globals.css'
import '@/styles/markdown.css'

export const App = () => {
  return (
    <JotaiProvider>
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        enableColorScheme={false}
      >
        <NuqsAdapter>
          <TanstackQueryInitializer>
            <ToastHost timeout={5000} limit={3} />
            <GlobalPublicStoreProvider>
              <TooltipProvider delay={300} closeDelay={200}>
                <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
                  <RouterProvider router={router} />
                </Suspense>
              </TooltipProvider>
            </GlobalPublicStoreProvider>
          </TanstackQueryInitializer>
        </NuqsAdapter>
      </ThemeProvider>
    </JotaiProvider>
  )
}