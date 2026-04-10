import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { CommonLayout } from '@/layouts/common-layout'

const Session = lazy(() => import('@/pages/session'))
const Tools = lazy(() => import('@/pages/tools'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/session" replace />,
  },
  {
    element: <CommonLayout />,
    children: [
      {
        path: '/session',
        element: <Session />,
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
