import React, { useCallback, useState } from 'react'
import Textarea from 'react-textarea-autosize'
import Operation from './operation'
import { clsx } from 'clsx'
import { useTextArea } from './use-textarea'
import type { Theme } from '../embedded-chatbot/theme/theme-context'
import type { InputForm, OnSend } from '../types'

interface ChatInputAreaProps {
  readonly?: boolean
  name?: string
  onSend?: OnSend
  inputs?: Record<string, any>
  inputsForm?: InputForm[]
  theme?: Theme | null
  responding?: boolean
  disabled?: boolean
  enterToSend?: boolean
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = React.memo(({ 
  readonly, 
  name, 
  inputs = {}, 
  inputsForm = [], 
  theme, 
  responding, 
  disabled, 
  enterToSend = true 
}) => {
  const { 
    wrapperRef, 
    textareaRef, 
    textValueRef, 
    holdSpaceRef, 
    onTextareaResize, 
    isMultipleLine 
  } = useTextArea()
  const [query, setQuery] = useState('')
  
  const onQueryChange = useCallback((value: string) => {
    setQuery(value)
    setTimeout(onTextareaResize, 0)
  }, [onTextareaResize])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {}, [])
  const onCompositionStart = useCallback(() => {}, [])
  const onCompositionEnd = useCallback(() => {}, [])
  const onPaste = useCallback(() => {}, [])
  const onDragEnter = useCallback(() => {}, [])
  const onDragLeave = useCallback(() => {}, [])
  const onDragOver = useCallback(() => {}, [])
  const onDrop = useCallback(() => {}, [])

  const operation = <Operation 
    theme={theme}
    readonly={readonly}
    onSend={() => {}}
  />

  return <>
    <div className={clsx(
      'relative z-10 overflow-hidden radius-full border border-components-chat-input-border bg-components-panel-bg-blur pb-[9px] shadow-md', 
      disabled && 'pointer-events-none border-components-panel-border opacity-50 shadow-none'
    )}>
      <div className="relative max-h-[158px] overflow-y-auto overflow-x-hidden px-[9px] pt-[9px]">
        <div ref={wrapperRef} className="flex items-center justify-between">
          <div className="relative flex w-full grow items-center">
            <div ref={textValueRef} className="pointer-events-none invisible absolute h-auto w-auto whitespace-pre p-1 leading-6 body-lg-regular">{query}</div>
            <Textarea 
              ref={ref => textareaRef.current = ref as any} 
              className="w-full resize-none bg-transparent p-1 leading-6 text-text-primary outline-none body-lg-regular" 
              placeholder="" 
              autoFocus minRows={1} 
              value={query} 
              onChange={e => onQueryChange(e.target.value)} 
              onKeyDown={onKeyDown} 
              onCompositionStart={onCompositionStart} 
              onCompositionEnd={onCompositionEnd} 
              onPaste={onPaste} 
              onDragEnter={onDragEnter} 
              onDragLeave={onDragLeave} 
              onDragOver={onDragOver} 
              onDrop={onDrop} 
              readOnly={readonly} />
          </div>
          { !isMultipleLine && operation }
        </div>
      </div>
      {isMultipleLine && (<div className="px-[9px]">{operation}</div>)}
    </div>
  </>
})

const ChatInputAreaWrapper = (props: ChatInputAreaProps) => {
  return (
    <ChatInputArea {...props} />
  )
}

export default ChatInputAreaWrapper
