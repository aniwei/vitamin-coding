import ActionButton from '@/components/action-button'
import { RiFileList3Line } from '@remixicon/react'
import type { FC } from 'react'
import type { ChatItem } from './types'

type LogProps = {
  logItem: ChatItem
}

export const Log: FC<LogProps> = ({ logItem }) => {
  return (
    <div
      className="ml-1 flex items-center gap-0.5 radius-lg border-[0.5px] border-components-actionbar-border bg-components-actionbar-bg p-0.5 shadow-md backdrop-blur-xs"
      onClick={(e) => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
      }}
    >
      <ActionButton>
        <RiFileList3Line className="h-4 w-4" />
      </ActionButton>
    </div>
  )
}

Log.displayName = 'Log'
export default Log
