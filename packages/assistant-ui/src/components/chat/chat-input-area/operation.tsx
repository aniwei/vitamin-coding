import ActionButton from '@/components/action-button'
import Button from '@/components/button'

import { clsx } from 'clsx'
import {
  RiMicLine,
  RiSendPlane2Fill,
} from '@remixicon/react'
import { noop } from 'es-toolkit/function'
import { memo } from 'react'
import type { FC, Ref } from 'react'
import type { Theme } from '../embedded-chatbot/theme/theme-context'
import type { EnableType } from '../types'

interface OperationProps {
  readonly?: boolean
  speechToTextSetting?: EnableType
  onShowVoiceInput?: () => void
  onSend: () => void
  theme?: Theme | null
  ref?: Ref<HTMLDivElement>
}

export const Operation: FC<OperationProps> = memo(({
  readonly,
  ref,
  speechToTextSetting,
  onShowVoiceInput,
  onSend,
  theme,
}) => {
  return (
    <div
      className="flex shrink-0 items-center justify-end"
    >
      <div
        ref={ref}
        className="flex items-center pl-1"
      >
        {/* TODO */}
        {/* <div className="flex items-center space-x-1">
          {
            speechToTextSetting?.enabled && (
              <ActionButton
                size="l"
                disabled={readonly}
                onClick={onShowVoiceInput}
                data-testid="voice-input-button"
              >
                <RiMicLine className="h-5 w-5" />
              </ActionButton>
            )
          }
        </div> */}
        <Button
          className="ml-3 w-8 px-0 radius-full"
          variant="primary"
          onClick={readonly ? noop : onSend}
          data-testid="send-button"
          style={theme ? { backgroundColor: theme.primaryColor } : {}}
        >
          <RiSendPlane2Fill className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
})

Operation.displayName = 'Operation'

export default Operation
