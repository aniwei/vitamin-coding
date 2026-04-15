import Button from '@/components/button'
import Answer from './answer'
import Question from './question'
import ChatInputArea from './chat-input-area'

import { memo } from 'react'
import { clsx} from 'clsx'
import { ChatContextProvider } from './context-provider'
import { useChatLayout } from './use-chat-layout'

import type { FC, ReactNode } from 'react'
import type { Emoji } from '@/components/tools/types'
import type { InputForm } from './types'
import type { ChatThemeBuilder } from './theme-context'
import type {
  ChatSetting,
  ChatItem,
  Feedback,
  OnRegenerate,
  OnSend,
} from './types'

export interface ChatProps {
  title?: string
  isTryApp?: boolean
  readonly?: boolean
  chatList: ChatItem[]
  setting?: ChatSetting
  responding?: boolean
  noStopResponding?: boolean
  noChatInput?: boolean
  inputs?: Record<string, any>
  inputsForm?: InputForm[]
  containerClassName?: string
  containerInnerClassName?: string
  footerClassName?: string
  footerInnerClassName?: string
  suggestedQuestions?: string[]
  showPromptLog?: boolean
  questionIcon?: ReactNode
  answerIcon?: ReactNode
  allToolIcons?: Record<string, string | Emoji>
  chatNode?: ReactNode
  disableFeedback?: boolean
  answerContainerInner?: string
  hideProcessDetail?: boolean
  hideLogModal?: boolean
  themeBuilder?: ChatThemeBuilder
  showFeatureBar?: boolean
  showFileUpload?: boolean
  spacing?: boolean
  inputDisabled?: boolean
  sidebarCollapseState?: boolean
  hideAvatar?: boolean
  enterToSend?: boolean
  onSend?: OnSend
  onStopResponding?: () => void
  onRegenerate?: OnRegenerate
  onAnnotationEdited?: (question: string, answer: string, index: number) => void
  onAnnotationAdded?: (annotationId: string, authorName: string, question: string, answer: string, index: number) => void
  onAnnotationRemoved?: (index: number) => void
  onFeedback?: (messageId: string, feedback: Feedback) => void
  switchSibling?: (siblingMessageId: string) => void
  onFeatureBarClick?: (state: boolean) => void
  onHumanInputFormSubmit?: (formToken: string, formData: any) => Promise<void>
  getHumanInputNodeData?: (nodeID: string) => any
}

export const Chat: FC<ChatProps> = memo(({
  title,
  isTryApp,
  readonly = false,
  setting,
  inputs,
  inputsForm,
  chatList,
  responding,
  noStopResponding,
  noChatInput,
  containerClassName,
  containerInnerClassName,
  footerClassName,
  footerInnerClassName,
  showPromptLog,
  questionIcon,
  answerIcon,
  chatNode,
  disableFeedback,
  answerContainerInner,
  hideProcessDetail,
  hideLogModal,
  themeBuilder,
  showFeatureBar,
  showFileUpload,
  spacing,
  inputDisabled,
  sidebarCollapseState,
  hideAvatar,
  enterToSend,
  onSend,
  onRegenerate,
  onStopResponding,
  onAnnotationAdded,
  onAnnotationEdited,
  onAnnotationRemoved,
  onFeedback,
  switchSibling,
  onFeatureBarClick,
  onHumanInputFormSubmit,
  getHumanInputNodeData,
}) => {
  const {
    width,
    containerRef,
    containerInnerRef,
    footerRef,
    footerInnerRef,
  } = useChatLayout({
    chatList,
    sidebarCollapseState,
  })

  return (
    <ChatContextProvider
      readonly={readonly}
      setting={setting}
      chatList={chatList}
      responding={responding}
      showPromptLog={showPromptLog}
      questionIcon={questionIcon}
      answerIcon={answerIcon}
      onSend={onSend}
      onRegenerate={onRegenerate}
      onAnnotationAdded={onAnnotationAdded}
      onAnnotationEdited={onAnnotationEdited}
      onAnnotationRemoved={onAnnotationRemoved}
      disableFeedback={disableFeedback}
      onFeedback={onFeedback}
      getHumanInputNodeData={getHumanInputNodeData}
    >
      <div className={clsx('relative h-full', isTryApp && 'flex flex-col')}>
        <div
          ref={containerRef}
          className={clsx(
            'relative h-full overflow-x-hidden overflow-y-auto', 
            isTryApp && 'h-0 grow', 
            containerClassName
          )}
        >
          {chatNode}
          <div
            ref={containerInnerRef}
            className={clsx(
              'w-full', 
              spacing && 'px-8', 
              containerInnerClassName, 
              isTryApp && 'px-0'
            )}
          >
            {
              chatList.map((item, index) => {
                if (item.isAnswer) {
                  const isLast = item.id === chatList.at(-1)?.id

                  return (
                    <Answer
                      key={item.id}
                      item={item}
                      question={chatList[index - 1]?.content}
                      index={index}
                      setting={setting}
                      answerIcon={answerIcon}
                      responding={isLast && responding}
                      showPromptLog={showPromptLog}
                      answerContainerInner={answerContainerInner}
                      hideProcessDetail={hideProcessDetail}
                      noChatInput={noChatInput}
                      switchSibling={switchSibling}
                      hideAvatar={hideAvatar}
                      onHumanInputFormSubmit={onHumanInputFormSubmit}
                    />
                  )
                }

                return (
                  <Question
                    key={item.id}
                    item={item}
                    questionIcon={questionIcon}
                    theme={themeBuilder?.theme}
                    editable={setting?.questionEditEnable}
                    switchSibling={switchSibling}
                    hideAvatar={hideAvatar}
                  />
                )
              })
            }
          </div>
        </div>
        <div
          className={clsx(
            'absolute bottom-0 z-10 flex justify-center bg-chat-input-mask', 
            (!noChatInput || !noStopResponding) && footerClassName
          )}
          ref={footerRef}
        >
          <div
            ref={footerInnerRef}
            className={clsx(
              'relative', 
              footerInnerClassName, 
              isTryApp && 'px-0'
            )}
          >
            {
              !noStopResponding && responding && (
                <div data-testid="stop-responding-container" className="mb-2 flex justify-center">
                  <Button className="border-components-panel-border bg-components-panel-bg text-components-button-secondary-text" onClick={onStopResponding}>
                    <div className="mr-[5px] i-custom-vender-solid-mediaAndDevices-stop-circle h-3.5 w-3.5" />
                    <span className="text-xs font-normal">Stop Responding</span>
                  </Button>
                </div>
              )
            }

            <ChatInputArea
              name={title || 'Bot'}
              disabled={inputDisabled}
              inputs={inputs}
              inputsForm={inputsForm}
              theme={themeBuilder?.theme}
              responding={responding}
              readonly={readonly}
              enterToSend={enterToSend}
              onSend={onSend}
            />
          </div>
        </div>
      </div>
    </ChatContextProvider>
  )
})

Chat.displayName = 'Chat'
export default Chat
