import clsx from 'clsx'
import * as React from 'react'
import type { FC } from 'react'

interface AddButtonProps {
  className?: string
  onClick: () => void
}

export const AddButton: FC<AddButtonProps> = ({
  className,
  onClick,
}) => {
  return (
    <div className={clsx(className, 'cursor-pointer select-none rounded-md p-1 hover:bg-state-base-hover')} onClick={onClick} data-testid="add-button">
      <span className="i-ri-add-line h-4 w-4 text-text-tertiary" />
    </div>
  )
}

AddButton.displayName = 'AddButton'
export default React.memo(AddButton)
