import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Provider as JotaiProvider } from 'jotai/react'
import { ThemeProvider } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'
import { ToastHost } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { router } from './routes'

import '@/styles/globals.css'
import '@/styles/markdown.css'

const query = new QueryClient()

export const App = () => {
  return (
    <QueryClientProvider client={query}>
      <JotaiProvider>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme={false}
        >
          <NuqsAdapter>
            <ToastHost timeout={5000} limit={3} />
            <TooltipProvider delay={300} closeDelay={200}>
              <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
                <RouterProvider router={router} />
              </Suspense>
            </TooltipProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </JotaiProvider>
    </QueryClientProvider>
  )
}