import clsx from 'clsx'
import { useState } from 'react'
import { useEventBusContext } from '@/context/event-bus'
import { useLocation } from 'react-router-dom'
import * as React from 'react'
import s from './index.module.css'

type HeaderWrapperProps = {
  children: React.ReactNode
}

const HeaderWrapper = ({
  children
}: HeaderWrapperProps) => {
  const pathname = useLocation().pathname
  const isBordered = ['/apps', '/datasets/create', '/tools'].includes(pathname)
  
  const inWorkflowCanvas = pathname.endsWith('/workflow')
  const isPipelineCanvas = pathname.endsWith('/pipeline')
  const workflowCanvasMaximize = localStorage.getItem('workflow-canvas-maximize') === 'true'
  const [hideHeader, setHideHeader] = useState(workflowCanvasMaximize)
  const { eventBus } = useEventBusContext()

  eventBus?.useSubscription((v: any) => {
    if (v?.type === 'workflow-canvas-maximize')
      setHideHeader(v.payload)
  })

  return (
    <div className={clsx('sticky left-0 right-0 top-0 z-30 flex min-h-[56px] shrink-0 grow-0 basis-auto flex-col', s.header, isBordered ? 'border-b border-divider-regular' : '', hideHeader && (inWorkflowCanvas || isPipelineCanvas) && 'hidden')}>
      {children}
    </div>
  )
}
export default HeaderWrapper
