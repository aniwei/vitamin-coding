import Divider from '@/components/divider'
import Item from './session-nav-item'
import NoApps from './no-session'
import { useBoolean } from 'ahooks'
import { useState } from 'react'
import {
  Alert,
  AlertActions,
  AlertCancelButton,
  AlertConfirmButton,
  AlertContent,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/components/ui/toast'
import { clsx } from 'clsx'
import { Link, useMatch } from 'react-router-dom'
import { useSessionList } from '@/service/use-session'
import * as React from 'react'


const expandedSidebarScrollAreaClassNames = {
  content: 'space-y-0.5',
  scrollbar: 'data-[orientation=vertical]:my-2 data-[orientation=vertical]:-me-3',
  viewport: 'overscroll-contain',
} as const

export const SideBar = () => {
  const segments = useMatch('/session/*')?.pathname.split('/').filter(Boolean) || []
  const lastSegment = segments.slice(-1)[0]
  const isDiscoverySelected = lastSegment === 'session'

  const { data, isPending } = useSessionList()
  const sessions = data ?? [] 

  const [isFold, { toggle: toggleIsFold }] = useBoolean(false)

  const [showConfirm, setShowConfirm] = useState(false)
  const [currId, setCurrId] = useState('')

  const onDelete = async () => {
    const id = currId
    setShowConfirm(false)
    toast.success(`${id} deleted`)
  }

  const onUpdatePinStatus = async (id: string, isPinned: boolean) => {
    // await updatePinStatus({ appId: id, isPinned })
    toast.success(`${id} ${isPinned ? 'pinned' : 'unpinned'}`)
  }

  const pinnedSessionsCount = sessions.filter(({ pinned }) => pinned).length
  const shouldUseExpandedScrollArea = !isFold
  const webAppsLabelId = React.useId()
  const sessionItems = sessions.map(({ id, title, pinned }, index) => (
    <React.Fragment key={id}>
      <Item
        title={title}
        // icon_type={icon_type}
        // icon={icon}
        // icon_background={icon_background}
        // icon_url={icon_url}
        id={id}
        selected={lastSegment?.toLowerCase() === id}
        pinned={pinned}
        pin={() => onUpdatePinStatus(id, !pinned)}
        onDelete={(id) => {
          setCurrId(id)
          setShowConfirm(true)
        }}
      />
      {index === pinnedSessionsCount - 1 && index !== sessions.length - 1 && <Divider />}
    </React.Fragment>
  ))

  return (
    <div className={clsx('flex h-full w-fit shrink-0 cursor-pointer flex-col px-3 pt-6 sm:w-[240px]', isFold && 'sm:w-[56px]')}>
      <div className={clsx(isDiscoverySelected ? 'text-text-accent' : 'text-text-tertiary')}>
        <Link
          to="/session/id"
          aria-label={isFold ? 'Title' : undefined}
          className={clsx(isDiscoverySelected ? 'bg-state-base-active' : 'hover:bg-state-base-hover', 'flex h-8 items-center gap-2 rounded-lg px-1 mobile:w-fit mobile:justify-center pc:w-full pc:justify-start')}
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-components-icon-bg-blue-solid">
            <span aria-hidden="true" className="i-ri-apps-fill size-3.5 text-components-avatar-shape-fill-stop-100" />
          </div>
          {!isFold && <div className={clsx('truncate', isDiscoverySelected ? 'text-components-menu-item-text-active system-sm-semibold' : 'text-components-menu-item-text system-sm-regular')}>Sessions</div>}
        </Link>
      </div>

      {
        !isPending && sessions.length === 0 && !isFold && (
          <div className="mt-5">
            <NoApps />
          </div>
        )
      }

      {sessions.length > 0 && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          {!isFold && <p id={webAppsLabelId} className="mb-1.5 break-all pl-2 uppercase text-text-tertiary system-xs-medium-uppercase mobile:px-0">WEBAPP</p>}
          {
            shouldUseExpandedScrollArea
              ? <div className="min-h-0 flex-1">
                <ScrollArea
                  className="h-full"
                  slotClassNames={expandedSidebarScrollAreaClassNames}
                  labelledBy={webAppsLabelId}
                >
                  {sessionItems}
                </ScrollArea>
              </div>
              : <div
                className="h-full min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden"
              >
                {sessionItems}
              </div>
          }
        </div>
      )}

      <div className="mt-auto flex pb-3 pt-3">
        <button
          type="button"
          aria-label={isFold ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="flex size-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-state-base-hover focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-components-input-border-hover"
          onClick={toggleIsFold}
        >
          {
            isFold
              ? <span aria-hidden="true" className="i-ri-expand-right-line" />
              : <span aria-hidden="true" className="i-ri-layout-left-2-line" />
          }
        </button>
      </div>
      

      <Alert open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertContent>
          <div className="flex flex-col items-start gap-2 self-stretch pb-4 pl-6 pr-6 pt-6">
            <AlertTitle className="w-full text-text-primary title-2xl-semi-bold">
              ...
            </AlertTitle>
            <AlertDescription className="w-full whitespace-pre-wrap wrap-break-word text-text-tertiary system-md-regular">
              ...
            </AlertDescription>
          </div>
          <AlertActions>
            <AlertCancelButton>Cancel</AlertCancelButton>
            <AlertConfirmButton onClick={onDelete}>Confirm</AlertConfirmButton>
          </AlertActions>
        </AlertContent>
      </Alert>
    </div>
  )
}

export default React.memo(SideBar)
