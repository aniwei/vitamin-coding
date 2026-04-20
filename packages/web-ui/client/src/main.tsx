import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/globals.css'
import 'katex/dist/katex.min.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider, ThemeStyleProvider } from './theme/theme-provider'
import { setupI18n } from './i18n'
import { router } from './router'

async function boot() {
  await setupI18n()

  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')

  createRoot(root).render(
    <StrictMode>
      <ThemeProvider
        attribute='class'
        defaultTheme='system'
        themes={['light', 'dark']}
        storageKey='app-theme-v2'
        disableTransitionOnChange
      >
        <ThemeStyleProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </ThemeStyleProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}

void boot()
