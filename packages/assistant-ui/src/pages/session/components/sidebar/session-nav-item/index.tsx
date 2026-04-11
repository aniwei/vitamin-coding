
import { clsx } from 'clsx'
import { useHover } from 'ahooks'
import { useRef } from 'react'
// import AppIcon from '@/components/app-icon'

import { ItemOperation } from '../../item-operation'
import { useNavigate } from 'react-router-dom'
import * as React from 'react'

type SessionNavItemProps = {
  id: string
  title: string
  selected: boolean
  pinned: boolean
  pin: () => void
  onDelete: (id: string) => void
}

export const SessionNavItem: React.FC<SessionNavItemProps> = ({
  id,
  title,
  selected,
  pinned,
  pin,
  onDelete,
}) => {
  const navigate = useNavigate()
  const url = `/session/${id}`
  const ref = useRef(null)
  const hovering = useHover(ref)
  
  return (
    <div
      ref={ref}
      key={id}
      className={clsx(
        'system-sm-medium flex h-8 items-center justify-between rounded-lg px-2 text-sm font-normal text-components-menu-item-text mobile:justify-center mobile:px-1', 
        selected ? 'bg-state-base-active text-components-menu-item-text-active' : 'hover:bg-state-base-hover hover:text-components-menu-item-text-hover'
      )}
      onClick={() => navigate(url)}
    >
      <div className="flex w-0 grow items-center space-x-2">
        {/* <AppIcon size="tiny" iconType={icon_type} icon={icon} background={icon_background} imageUrl={icon_url} /> */}
        <div className="system-sm-regular truncate text-components-menu-item-text" title={title}>{title}</div>
      </div>
      <div className="h-6 shrink-0" onClick={e => e.stopPropagation()}>
        <ItemOperation
          pinned={pinned}
          hovering={hovering}
          pin={pin}
          showDelete={true}
          onDelete={() => onDelete(id)}
        />
      </div>
</div>
  )
}

export default SessionNavItem