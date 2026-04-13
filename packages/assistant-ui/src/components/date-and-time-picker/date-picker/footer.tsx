import Button from '@/components/button'
import { RiTimeLine } from '@remixicon/react'
import { memo } from 'react'
import { clsx } from 'clsx'
import { ViewType } from '../types'
import type { FC } from 'react'
import type { DatePickerFooterProps } from '../types'

export const Footer: FC<DatePickerFooterProps> = memo(({
  disabledTimePicker,
  displayTime,
  view,
  onClickTimePicker,
  onSelectCurrentDate,
  onConfirm,
}) => {

  return (
    <div className={clsx(
      'flex items-center justify-between border-t-[0.5px] border-divider-regular p-2',
      disabledTimePicker && 'justify-end',
    )}
    >
      {
        disabledTimePicker && (
        <button
          type="button"
          className="system-xs-medium flex items-center gap-x-px rounded-md border-[0.5px] border-components-button-secondary-border bg-components-button-secondary-bg px-1.5
                      py-1 text-components-button-secondary-accent-text shadow-xs shadow-shadow-shadow-3 backdrop-blur-[5px]"
          onClick={onClickTimePicker}
        >
          <RiTimeLine className="h-3.5 w-3.5" />
          {view === ViewType.Date && <span>{displayTime}</span>}
          {view === ViewType.Time && <span>Pick date</span>}
        </button>
      )}
      <div className="flex items-center gap-x-1">
        <button
          type="button"
          className="system-xs-medium flex items-center justify-center px-1.5 py-1 text-components-button-secondary-accent-text"
          onClick={onSelectCurrentDate}
        >
          <span className="px-[3px]">Now</span>
        </button>
        <Button
          variant="primary"
          size="small"
          className="w-16 px-1.5 py-1"
          onClick={onConfirm}
        >OK</Button>
      </div>
    </div>
  )
})

export default Footer
