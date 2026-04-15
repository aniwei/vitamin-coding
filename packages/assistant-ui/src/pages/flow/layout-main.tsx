import AppSideBar from '@/components/app-sidebar'
import Loading from '@/components/loading'
import { clsx } from 'clsx'

import * as React from 'react'
import type { FC } from 'react'

import s from './index.module.css'


interface WorkflowLayoutProps {
  children: React.ReactNode
  sessionId: string
}

const WorkflowLayout: FC<WorkflowLayoutProps> = React.memo((props) => {
  const { children, sessionId } = props
  
  return (
    <div className={clsx(s.app, 'h-full w-full relative flex overflow-hidden')}>
      <AppSideBar navigation={[]} />
      <div className="grow overflow-hidden bg-components-panel-bg">
        {children}
      </div>
    </div>
  )
})

export default WorkflowLayout
