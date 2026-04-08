import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import CommonLayout from './layouts/common-layout'

const Apps = lazy(() => import('@/pages/apps'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/apps" replace />,
  },
  {
    element: <CommonLayout />,
    children: [
      {
        path: '/apps',
        element: <Apps />,
      },
    ],
  },
])
