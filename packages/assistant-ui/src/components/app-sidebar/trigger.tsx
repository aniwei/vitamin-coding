import { RiEqualizer2Line } from '@remixicon/react'
import { clsx } from 'clsx'
import { memo } from 'react'
import * as React from 'react'

interface TriggerProps {
  expand: boolean
  onClick: () => void
}

const Trigger: React.FC<TriggerProps> = memo(({ expand, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full"
      aria-label="Toggle sidebar"
    >
      <div className="flex flex-col gap-2 rounded-lg p-1 hover:bg-state-base-hover">
        <div className="flex items-center justify-center">
          <div className="flex h-5 w-5 items-center justify-center rounded-md p-0.5">
            <RiEqualizer2Line className="h-4 w-4 text-text-tertiary" />
          </div>
        </div>
      </div>
    </button>
  )
})

export default Trigger
