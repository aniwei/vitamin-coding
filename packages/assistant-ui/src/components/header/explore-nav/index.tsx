import {
  RiPlanetFill,
  RiPlanetLine,
} from '@remixicon/react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'

type ExploreNavProps = {
  className?: string
}

const ExploreNav = ({
  className,
}: ExploreNavProps) => {
  // TODO
  // const selectedSegment = useSelectedLayoutSegment()
  const selectedSegment = 'explore'
  const activated = selectedSegment === 'explore'

  return (
    <Link
      to="/explore/apps"
      className={clsx(className, 'group', activated && 'bg-components-main-nav-nav-button-bg-active shadow-md', activated ? 'text-components-main-nav-nav-button-text-active' : 'text-components-main-nav-nav-button-text hover:bg-components-main-nav-nav-button-bg-hover')}
    >
      {
        activated
          ? <RiPlanetFill className="h-4 w-4" />
          : <RiPlanetLine className="h-4 w-4" />
      }
      <div className="ml-2 max-[1024px]:hidden">Explore</div>
    </Link>
  )
}

export default ExploreNav
