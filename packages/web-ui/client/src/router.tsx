import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './layouts/root-layout'
import { GlobalError } from './routes/errors/global-error'
import { NotFound } from './routes/errors/not-found'

// TODO(migration): 页面模块将在 Phase 2 按 docs/web-ui/migration-technical-design.md 4.1 节迁入。
// 目前为最小可运行骨架：根布局 + 占位首页 + 错误边界。
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <GlobalError />,
    children: [
      {
        index: true,
        element: <Navigate to='/chat/new' replace />,
      },
      {
        path: 'chat/:thread',
        lazy: async () => {
          const m = await import('./routes/chat/placeholder')
          return { Component: m.default }
        },
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
])
