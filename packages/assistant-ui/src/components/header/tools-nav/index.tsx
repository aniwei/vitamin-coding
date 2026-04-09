import clsx from 'clsx'
import {
  RiHammerFill,
  RiHammerLine,
} from '@remixicon/react'
import { Link } from 'react-router-dom'

type ToolsNavProps = {
  className?: string
}

const ToolsNav = ({
  className,
}: ToolsNavProps) => {
  // const selectedSegment = useSelectedLayoutSegment()
  const selectedSegment = 'tools'
  const activated = selectedSegment === 'tools'

  return (
    <Link
      to="/tools"
      className={clsx('group text-sm font-medium', activated && 'hover:bg-components-main-nav-nav-button-bg-active-hover bg-components-main-nav-nav-button-bg-active font-semibold shadow-md', activated ? 'text-components-main-nav-nav-button-text-active' : 'text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover', className)}
    >
      {
        activated
          ? <RiHammerFill className="h-4 w-4" />
          : <RiHammerLine className="h-4 w-4" />
      }
      <div className="ml-2 max-[1024px]:hidden">Tools</div>
    </Link>
  )
}

export default ToolsNav
