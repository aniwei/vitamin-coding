import clsx from 'clsx'
import Logo from '@/components/logo'
import WorkplaceSelector from './workplace-selector'
import MenusNav from './menus-nav'
import EnvNav from './env-nav'
import ToolsNav from './tools-nav'
import SessionNav from './session-nav'
import { useLocation } from 'react-router-dom'
import { useState } from 'react'
import s from './index.module.css'



const Header = () => {
  const pathname = useLocation().pathname
  const isBordered = [
    '/sessions', 
    '/tools'
  ].includes(pathname)
  
  const inWorkflowCanvas = pathname.endsWith('/workflow')
  const isPipelineCanvas = pathname.endsWith('/pipeline')
  const workflowCanvasMaximize = localStorage.getItem('workflow-canvas-maximize') === 'true'
  const [hideHeader, setHideHeader] = useState(workflowCanvasMaximize)


  return (
    <div className={clsx('sticky left-0 right-0 top-0 z-30 flex min-h-[56px] shrink-0 grow-0 basis-auto flex-col', s.header, isBordered ? 'border-b border-divider-regular' : '', hideHeader && (inWorkflowCanvas || isPipelineCanvas) && 'hidden')}>
      <div className="flex h-[56px] items-center">
        <div className="flex min-w-0 flex-1 items-center pl-3 pr-2 min-[1280px]:pr-3">
          <Logo />
          <div className="mx-1.5 shrink-0 font-light text-divider-deep">/</div>
          <WorkplaceSelector />
        </div>
        <div className="flex items-center space-x-2">
          <SessionNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" />
          <ToolsNav className="flex items-center relative px-3 h-8 rounded-xl font-medium text-sm cursor-pointer" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end pl-2 pr-3 min-[1280px]:pl-3">
          <EnvNav />
          <MenusNav />
        </div>
      </div>
    </div>
  )
}
export default Header
