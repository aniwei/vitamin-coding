import Sidebar from './sidebar'
import * as React from 'react'

export const Session = ({
  children,
}: {
  children?: React.ReactNode
}) => {
  debugger
  return (
    <div className="flex h-full overflow-hidden border-t border-divider-regular bg-background-body">
      <Sidebar />
      <div className="h-full min-h-0 w-0 grow">
        {children}
      </div>
    </div>
  )
}
export default React.memo(Session)
