import Button from '@/components/button'

import { RiSendPlane2Fill } from '@remixicon/react'
import { noop } from 'es-toolkit/function'
import { memo } from 'react'
import type { FC, Ref } from 'react'
import type { ChatTheme } from '../theme-context'

type OperationProps = {
  readonly?: boolean
  onSend: () => void
  theme?: ChatTheme | null
  ref?: Ref<HTMLDivElement>
}

export const Operation: FC<OperationProps> = memo(({
  ref,
  theme,
  readonly,
  onSend,
}) => {
  return (
    <div className="flex shrink-0 items-center justify-end">
      <div
        ref={ref}
        className="flex items-center pl-1"
      >
        <Button
          className="ml-3 w-8 px-0 radius-full"
          variant="primary"
          onClick={readonly ? noop : onSend}
          style={ theme ? { backgroundColor: theme.primaryColor } : {} }
        >
          <RiSendPlane2Fill className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
})

Operation.displayName = 'Operation'
export default Operation
