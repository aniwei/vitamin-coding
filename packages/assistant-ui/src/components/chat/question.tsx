
import copy from 'copy-to-clipboard'
import Textarea from 'react-textarea-autosize'
import Button from '@/components/button'
import ActionButton from '@/components/action-button'
import ContentSwitch from './content-switch'
import { clsx } from 'clsx'
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { User } from '@/components/icons/src/public/avatar'
// import { Markdown } from '@/components/markdown'
import { toast } from '@/components/ui/toast'
import { CssTransform } from './embedded-chatbot/theme/utils'
import { useChatContext } from './context'
import type { FC, ReactNode } from 'react'
import type { Theme } from './embedded-chatbot/theme/theme-context'
import type { ChatItem } from './types'


interface QuestionProps {
  item: ChatItem
  questionIcon?: ReactNode
  theme: Theme | null | undefined
  enableEdit?: boolean
  switchSibling?: (siblingMessageId: string) => void
  hideAvatar?: boolean
}

const Question: FC<QuestionProps> = memo(({
  item,
  questionIcon,
  theme,
  enableEdit = true,
  switchSibling,
  hideAvatar,
}) => {
  const { content } = item

  const { onRegenerate } = useChatContext()

  const [editing, setEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(content)
  const [contentWidth, setContentWidth] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const compositionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEdit = useCallback(() => {
    setEditing(true)
    setEditedContent(content)
  }, [content])

  const handleResend = useCallback(() => {
    if (compositionEndTimerRef.current) {
      clearTimeout(compositionEndTimerRef.current)
      compositionEndTimerRef.current = null
    }
    isComposingRef.current = false
    setEditing(false)
    onRegenerate?.(item, { message: editedContent })
  }, [editedContent, item, onRegenerate])

  const handleCancelEditing = useCallback(() => {
    if (compositionEndTimerRef.current) {
      clearTimeout(compositionEndTimerRef.current)
      compositionEndTimerRef.current = null
    }
    isComposingRef.current = false
    setEditing(false)
    setEditedContent(content)
  }, [content])

  const handleEditInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey)
      return

    if (e.nativeEvent.isComposing)
      return

    if (isComposingRef.current) {
      e.preventDefault()
      return
    }

    e.preventDefault()
    handleResend()
  }, [handleResend])

  const clearCompositionEndTimer = useCallback(() => {
    if (!compositionEndTimerRef.current)
      return

    clearTimeout(compositionEndTimerRef.current)
    compositionEndTimerRef.current = null
  }, [])

  const handleCompositionStart = useCallback(() => {
    clearCompositionEndTimer()
    isComposingRef.current = true
  }, [clearCompositionEndTimer])

  const handleCompositionEnd = useCallback(() => {
    clearCompositionEndTimer()
    compositionEndTimerRef.current = setTimeout(() => {
      isComposingRef.current = false
      compositionEndTimerRef.current = null
    }, 50)
  }, [clearCompositionEndTimer])

  const handleSwitchSibling = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (item.prevSibling)
        switchSibling?.(item.prevSibling)
    }
    else {
      if (item.nextSibling)
        switchSibling?.(item.nextSibling)
    }
  }, [switchSibling, item.prevSibling, item.nextSibling])

  const getContentWidth = () => {
    /* v8 ignore next 2 -- @preserve */
    if (contentRef.current)
      setContentWidth(contentRef.current?.clientWidth)
  }

  useEffect(() => {
    /* v8 ignore next 2 -- @preserve */
    if (!contentRef.current)
      return
    const resizeObserver = new ResizeObserver(() => {
      getContentWidth()
    })
    resizeObserver.observe(contentRef.current)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    return () => {
      clearCompositionEndTimer()
    }
  }, [clearCompositionEndTimer])

  return (
    <div className="mb-2 flex justify-end last:mb-0">
      <div className={clsx('group relative mr-4 flex max-w-full items-start overflow-x-hidden pl-14', editing && 'flex-1')}>
        <div className={clsx('mr-2 gap-1', editing ? 'hidden' : 'flex')}>
          <div
            data-testid="action-container"
            className="absolute hidden gap-0.5 radius-lg border-[0.5px] border-components-actionbar-border bg-components-actionbar-bg p-0.5 shadow-md backdrop-blur-xs group-hover:flex"
            style={{ right: contentWidth + 8 }}
          >
            <ActionButton
              data-testid="copy-btn"
              onClick={() => {
                copy(content)
                toast.success('Copy successfully')
              }}
            >
              <div className="i-ri-clipboard-line h-4 w-4" />
            </ActionButton>
            {enableEdit && (
              <ActionButton data-testid="edit-btn" onClick={handleEdit}>
                <div className="i-ri-edit-line h-4 w-4" />
              </ActionButton>
            )}
          </div>
        </div>
        <div
          ref={contentRef}
          data-testid="question-content"
          className={clsx(
            'w-full px-4 py-3 text-sm',
            !editing && 'rounded-2xl bg-background-gradient-bg-fill-chat-bubble-bg-3 text-text-primary',
            editing && 'rounded-[24px] border-[3px] border-components-option-card-option-selected-border bg-components-panel-bg-blur shadow-lg',
          )}
          style={(!editing && theme?.chatBubbleColorStyle) ? CssTransform(theme.chatBubbleColorStyle) : {}}
        >
          
          {!editing
            ? <div>{content}</div> //TODO <Markdown content={content} />
            : (
                <div className="flex flex-col gap-4">
                  <div className="max-h-[158px] overflow-y-auto overflow-x-hidden pr-1">
                    <Textarea
                      className={clsx(
                        'w-full resize-none bg-transparent p-0 leading-7 text-text-primary outline-hidden body-lg-regular',
                      )}
                      autoFocus
                      minRows={1}
                      value={editedContent}
                      onChange={e => setEditedContent(e.target.value)}
                      onKeyDown={handleEditInputKeyDown}
                      onCompositionStart={handleCompositionStart}
                      onCompositionEnd={handleCompositionEnd}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button className="min-w-24" onClick={handleCancelEditing} data-testid="cancel-edit-btn">Cancel</Button>
                    <Button className="min-w-24" variant="primary" onClick={handleResend} data-testid="save-edit-btn">Save</Button>
                  </div>
                </div>
              )}
          {!editing && (
            <ContentSwitch
              count={item.siblingCount}
              currentIndex={item.siblingIndex}
              prevDisabled={!item.prevSibling}
              nextDisabled={!item.nextSibling}
              switchSibling={handleSwitchSibling}
            />
          )}
        </div>
        <div className="mt-1 h-[18px]" />
      </div>
      {!hideAvatar && (
        <div className="h-10 w-10 shrink-0">
          {
            questionIcon || <div className="h-full w-full rounded-full border-[0.5px] border-black/5">
              <User className="question-default-user-icon h-full w-full" />
            </div>
          }
        </div>
      )}
    </div>
  )
})

export default Question
