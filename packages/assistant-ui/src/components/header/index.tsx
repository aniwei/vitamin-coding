import clsx from 'clsx'
// import WorkplaceSelector from '@/components/header/dropdown/workplace-selector'
import MenusNav from './menus-nav'
// import AppNav from './app-nav'
// import DatasetNav from './dataset-nav'
import Logo from '@/components/logo'
import EnvNav from './env-nav'
import ExploreNav from './explore-nav'
import ToolsNav from './tools-nav'
import SessionNav from './session-nav'
import { Link, useLocation } from 'react-router-dom'
// import { WorkspaceProvider } from '@/context/workspace-context'
import { useState } from 'react'
import { useEventBus } from '@/context/event-bus'
import s from './index.module.css'



const Header = () => {
  const pathname = useLocation().pathname
  const isBordered = ['/apps', '/datasets/create', '/tools'].includes(pathname)
  
  const inWorkflowCanvas = pathname.endsWith('/workflow')
  const isPipelineCanvas = pathname.endsWith('/pipeline')
  const workflowCanvasMaximize = localStorage.getItem('workflow-canvas-maximize') === 'true'
  const [hideHeader, setHideHeader] = useState(workflowCanvasMaximize)
  const { eventBus } = useEventBus()

  eventBus?.useSubscription((v: any) => {
    if (v?.type === 'workflow-canvas-maximize')
      setHideHeader(v.payload)
  })

  return (
    <div className={clsx('sticky left-0 right-0 top-0 z-30 flex min-h-[56px] shrink-0 grow-0 basis-auto flex-col', s.header, isBordered ? 'border-b border-divider-regular' : '', hideHeader && (inWorkflowCanvas || isPipelineCanvas) && 'hidden')}>
      <div className="flex h-[56px] items-center">
        <div className="flex min-w-0 flex-1 items-center pl-3 pr-2 min-[1280px]:pr-3">
          <Logo />
          <div className="mx-1.5 shrink-0 font-light text-divider-deep">/</div>
          {/* <WorkspaceProvider> */}
            <div>111</div>
            {/* <WorkplaceSelector /> */}
          {/* </WorkspaceProvider> */}
        </div>
        <div className="flex items-center space-x-2">
          {/* <ExploreNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" /> */}
          <SessionNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" />
          {/* <AppNav /> */}
          {/* <DatasetNav /> */}
          <ToolsNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end pl-2 pr-3 min-[1280px]:pl-3">
          <EnvNav />
          {/* TODO */}
          {/* <div className="mr-2">
            <PluginsNav />
          </div> */}
          <MenusNav />
        </div>
      </div>
    </div>
  )
}
export default Header
