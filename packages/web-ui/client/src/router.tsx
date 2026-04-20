import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './layouts/root-layout'
import { ChatLayout } from './layouts/chat-layout'
import { AuthLayout } from './layouts/auth-layout'
import { GlobalError } from './routes/errors/global-error'
import { NotFound } from './routes/errors/not-found'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <GlobalError />,
    children: [
      // Auth routes
      {
        element: <AuthLayout />,
        children: [
          { path: 'sign-in', lazy: async () => ({ Component: (await import('./routes/auth/sign-in')).default }) },
          { path: 'sign-up', lazy: async () => ({ Component: (await import('./routes/auth/sign-up')).default }) },
          { path: 'sign-up/email', lazy: async () => ({ Component: (await import('./routes/auth/sign-up-email')).default }) },
        ],
      },
      // Export route (public)
      {
        path: 'export/:id',
        lazy: async () => ({ Component: (await import('./routes/export/detail')).default }),
      },
      // Chat routes (protected - chat layout)
      {
        element: <ChatLayout />,
        children: [
          { index: true, element: <Navigate to='/chat/new' replace /> },
          { path: 'chat/new', lazy: async () => ({ Component: (await import('./routes/chat/new')).default }) },
          { path: 'chat/:thread', lazy: async () => ({ Component: (await import('./routes/chat/thread')).default }) },
          { path: 'agents', lazy: async () => ({ Component: (await import('./routes/agents/index')).default }) },
          { path: 'agent/:id', lazy: async () => ({ Component: (await import('./routes/agents/edit')).default }) },
          { path: 'mcp', lazy: async () => ({ Component: (await import('./routes/mcp/index')).default }) },
          { path: 'mcp/create', lazy: async () => ({ Component: (await import('./routes/mcp/create')).default }) },
          { path: 'mcp/modify/:id', lazy: async () => ({ Component: (await import('./routes/mcp/modify')).default }) },
          { path: 'mcp/test/:id', lazy: async () => ({ Component: (await import('./routes/mcp/test')).default }) },
          { path: 'workflow', lazy: async () => ({ Component: (await import('./routes/workflow/index')).default }) },
          { path: 'workflow/:id', lazy: async () => ({ Component: (await import('./routes/workflow/detail')).default }) },
          { path: 'archive/:id', lazy: async () => ({ Component: (await import('./routes/archive/detail')).default }) },
          { path: 'admin/users', lazy: async () => ({ Component: (await import('./routes/admin/users')).default }) },
          { path: 'admin/users/:id', lazy: async () => ({ Component: (await import('./routes/admin/user-detail')).default }) },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

