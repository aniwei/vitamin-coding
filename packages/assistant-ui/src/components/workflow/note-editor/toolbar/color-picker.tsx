import {
  memo,
  useState,
} from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { clsx } from 'clsx'
import { getNoteTheme } from '@/components/workflow/types'
import { NoteTheme } from '../../types'

export const COLOR_LIST = [
  {
    key: NoteTheme.Blue,
    inner: getNoteTheme(NoteTheme.Blue).title,
    outer: getNoteTheme(NoteTheme.Blue).outer,
  },
  {
    key: NoteTheme.Cyan,
    inner: getNoteTheme(NoteTheme.Cyan).title,
    outer: getNoteTheme(NoteTheme.Cyan).outer,
  },
  {
    key: NoteTheme.Green,
    inner: getNoteTheme(NoteTheme.Green).title,
    outer: getNoteTheme(NoteTheme.Green).outer,
  },
  {
    key: NoteTheme.Yellow,
    inner: getNoteTheme(NoteTheme.Yellow).title,
    outer: getNoteTheme(NoteTheme.Yellow).outer,
  },
  {
    key: NoteTheme.Pink,
    inner: getNoteTheme(NoteTheme.Pink).title,
    outer: getNoteTheme(NoteTheme.Pink).outer,
  },
  {
    key: NoteTheme.Violet,
    inner: getNoteTheme(NoteTheme.Violet).title,
    outer: getNoteTheme(NoteTheme.Violet).outer,
  },
]

export interface ColorPickerProps {
  theme: NoteTheme
  onThemeChange: (theme: NoteTheme) => void
}

const ColorPicker = memo(({
  theme,
  onThemeChange,
}: ColorPickerProps) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(
          <div 
            className={clsx(
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-black/5',
              open && 'bg-black/5',
            )}
          >
            <div
              className={clsx(
                'h-4 w-4 rounded-full border border-black/5',
                getNoteTheme(theme).title,
              )}
            >
            </div>
          </div>
        )}
      />
      <PopoverContent
        placement="top"
        sideOffset={4}
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div className="grid grid-cols-3 grid-rows-2 gap-0.5 rounded-lg border-[0.5px] border-components-actionbar-border bg-components-actionbar-bg p-0.5 shadow-lg">
          {
            COLOR_LIST.map(color => (
              <div
                key={color.key}
                className="group relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md"
                onClick={(e) => {
                  e.stopPropagation()
                  onThemeChange(color.key)
                  setOpen(false)
                }}
              >
                <div
                  className={clsx(
                    'absolute left-1/2 top-1/2 hidden h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] group-hover:block',
                    color.outer,
                  )}
                >
                </div>
                <div
                  className={clsx(
                    'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/5',
                    color.inner,
                  )}
                >
                </div>
              </div>
            ))
          }
        </div>
      </PopoverContent>
    </Popover>
  )
})

ColorPicker.displayName = 'ColorPicker'
export default ColorPicker
