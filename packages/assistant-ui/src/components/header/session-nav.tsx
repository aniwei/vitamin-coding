import {
  RiRobot2Fill,
  RiRobot2Line,
} from '@remixicon/react'
import Nav from './nav'
import { useCallback, useEffect, useState } from 'react'
import type { NavItem } from './nav/nav-selector'

type SessionNavProps = {
  className?: string
  sessionId?: string
}

const SessionNav: React.FC<SessionNavProps> = (props) => {
  const { sessionId } = props
  const currentNav: NavItem = {
    id: sessionId || '',
    title: `Session ${sessionId ? `#${sessionId.slice(-4)}` : ''}`,
    link: `/sessions/${sessionId}`,
    icon: '',
    icon_background: null,
    icon_url: null,
  } 
  const [navs, setNavs] = useState<NavItem[]>([])
  
  const handleLoadMore = useCallback(() => {
  
  }, [])

  const handleCreate = useCallback(() => {

  }, [])


  useEffect(() => {
    
  }, [])


  return (
    <>
      <Nav
        icon={<RiRobot2Line className="h-4 w-4" />}
        activeIcon={<RiRobot2Fill className="h-4 w-4" />}
        text={sessionId}
        activeSegment={['sessions', 'session']}
        link="/sessions"
        currentNav={currentNav}
        navigations={navs}
        createText="New Session"
        onCreate={handleCreate}
        onLoadMore={handleLoadMore}
        loadingMore={false}
      />
    </>
  )
}

SessionNav.displayName = 'SessionNav'
export default SessionNav
