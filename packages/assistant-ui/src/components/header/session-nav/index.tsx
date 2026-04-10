import clsx from 'clsx'
import {
  RiPlanetFill,
  RiPlanetLine,
} from '@remixicon/react'
import { Link } from 'react-router-dom'
import { useMatch } from 'react-router-dom'

type ExploreNavProps = {
  className?: string
}

const SessionNav = ({
  className,
}: ExploreNavProps) => {
  const activated = useMatch('/session/*')

  return (
    <Link
      to="/session"
      className={clsx(className, 'group', activated && 'bg-components-main-nav-nav-button-bg-active shadow-md', activated ? 'text-components-main-nav-nav-button-text-active' : 'text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover')}
    >
      {
        activated
          ? <RiPlanetFill className="h-4 w-4" />
          : <RiPlanetLine className="h-4 w-4" />
      }
      <div className="ml-2 max-[1024px]:hidden">Session</div>
    </Link>
  )
}

export default SessionNav
