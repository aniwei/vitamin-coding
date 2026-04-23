import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { CommonLayout } from '@/layouts/common-layout'

const Session = lazy(() => import('@/pages/session'))
const Workflow = lazy(() => import('@/pages/workflow'))
const Tools = lazy(() => import('@/pages/tools'))

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/session" replace /> },
  {
    element: <CommonLayout />,
    children: [
      {
        path: '/sessions',
        element: <Session />,
      },
    ],
  },
  {
    element: <CommonLayout />,
    children: [
      {
        path: '/sessions/:sessionId',
        element: <Workflow />,
      },
    ],
  },
  {
    element: <CommonLayout />,
    children: [
      {
        path: '/tools',
        element: <Tools />,
      },
    ],
  },
])
