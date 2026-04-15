import { RiFontSize } from '@remixicon/react'
import { memo } from 'react'
import { Check } from '@/components/icons/line/general'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { clsx } from 'clsx'
import { useFontSize } from './hooks'

const FontSizeSelector = memo(() => {
  const FONT_SIZE_LIST = [
    {
      key: '12px',
      value: 'Small',
    },
    {
      key: '14px',
      value: 'Medium',
    },
    {
      key: '16px',
      value: 'Large',
    },
  ]
  const {
    fontSizeSelectorShow,
    handleOpenFontSizeSelector,
    fontSize,
    handleFontSize,
  } = useFontSize()

  return (
    <Popover
      open={fontSizeSelectorShow}
      onOpenChange={handleOpenFontSizeSelector}
    >
      <PopoverTrigger
        render={(
          <div className={clsx(
            'flex h-8 cursor-pointer items-center rounded-md pl-2 pr-1.5 text-[13px] font-medium text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary',
            fontSizeSelectorShow && 'bg-state-base-hover text-text-secondary',
          )}
          >
            <RiFontSize className="mr-1 h-4 w-4" />
            {FONT_SIZE_LIST.find(font => font.key === fontSize)?.value || 'Small'}
          </div>
        )}
      />
      <PopoverContent
        placement="bottom-start"
        sideOffset={2}
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div className="w-[120px] rounded-md border-[0.5px] border-components-panel-border bg-components-panel-bg-blur p-1 text-text-secondary shadow-xl">
          {
            FONT_SIZE_LIST.map(font => (
              <div
                key={font.key}
                className="flex h-8 cursor-pointer items-center justify-between rounded-md pl-3 pr-2 hover:bg-state-base-hover"
                onClick={(e) => {
                  e.stopPropagation()
                  handleFontSize(font.key)
                  handleOpenFontSizeSelector(false)
                }}
              >
                <div
                  style={{ fontSize: font.key }}
                >
                  {font.value}
                </div>
                {
                  fontSize === font.key && (
                    <Check className="h-4 w-4 text-text-accent" />
                  )
                }
              </div>
            ))
          }
        </div>
      </PopoverContent>
    </Popover>
  )
})

export default FontSizeSelector
