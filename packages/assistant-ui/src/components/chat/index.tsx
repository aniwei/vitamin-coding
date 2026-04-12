import Button from '@/components/button'
import Answer from './answer'
import Question from './question'
import TryToAsk from './try-to-ask'
import ChatInputArea from './chat-input-area'

import { memo } from 'react'
import { clsx} from 'clsx'
import { ChatContextProvider } from './context-provider'
import { useChatLayout } from './use-chat-layout'

import type { FC, ReactNode } from 'react'
import type { Emoji } from '@/components/tools/types'
import type { InputForm } from './types'
import type { ThemeBuilder } from './embedded-chatbot/theme/theme-context'
import type {
  ChatSetting,
  ChatItem,
  Feedback,
  OnRegenerate,
  OnSend,
} from './types'

export type ChatProps = {
  isTryApp?: boolean
  readonly?: boolean
  chatList: ChatItem[]
  setting?: ChatSetting
  responding?: boolean
  noStopResponding?: boolean
  onStopResponding?: () => void
  noChatInput?: boolean
  onSend?: OnSend
  inputs?: Record<string, any>
  inputsForm?: InputForm[]
  onRegenerate?: OnRegenerate
  chatContainerClassName?: string
  chatContainerInnerClassName?: string
  chatFooterClassName?: string
  chatFooterInnerClassName?: string
  suggestedQuestions?: string[]
  showPromptLog?: boolean
  questionIcon?: ReactNode
  answerIcon?: ReactNode
  allToolIcons?: Record<string, string | Emoji>
  chatNode?: ReactNode
  disableFeedback?: boolean
  chatAnswerContainerInner?: string
  hideProcessDetail?: boolean
  hideLogModal?: boolean
  themeBuilder?: ThemeBuilder
  showFeatureBar?: boolean
  showFileUpload?: boolean
  noSpacing?: boolean
  inputDisabled?: boolean
  sidebarCollapseState?: boolean
  hideAvatar?: boolean
  sendOnEnter?: boolean
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
  isTryApp,
  readonly = false,
  setting,
  onSend,
  inputs,
  inputsForm,
  onRegenerate,
  chatList,
  responding,
  noStopResponding,
  onStopResponding,
  noChatInput,
  chatContainerClassName,
  chatContainerInnerClassName,
  chatFooterClassName,
  chatFooterInnerClassName,
  suggestedQuestions,
  showPromptLog,
  questionIcon,
  answerIcon,
  onAnnotationAdded,
  onAnnotationEdited,
  onAnnotationRemoved,
  chatNode,
  disableFeedback,
  onFeedback,
  chatAnswerContainerInner,
  hideProcessDetail,
  hideLogModal,
  themeBuilder,
  switchSibling,
  showFeatureBar,
  showFileUpload,
  onFeatureBarClick,
  noSpacing,
  inputDisabled,
  sidebarCollapseState,
  hideAvatar,
  sendOnEnter,
  onHumanInputFormSubmit,
  getHumanInputNodeData,
}) => {
  const {
    width,
    chatContainerRef,
    chatContainerInnerRef,
    chatFooterRef,
    chatFooterInnerRef,
  } = useChatLayout({
    chatList,
    sidebarCollapseState,
  })
  // TODO
  const appData: any = {}

  const hasTryToAsk = setting?.suggested_questions_after_answer?.enabled && !!suggestedQuestions?.length && onSend

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
      <div data-testid="chat-root" className={clsx('relative h-full', isTryApp && 'flex flex-col')}>
        <div
          data-testid="chat-container"
          ref={chatContainerRef}
          className={clsx('relative h-full overflow-x-hidden overflow-y-auto', isTryApp && 'h-0 grow', chatContainerClassName)}
        >
          {chatNode}
          <div
            ref={chatContainerInnerRef}
            className={clsx('w-full', !noSpacing && 'px-8', chatContainerInnerClassName, isTryApp && 'px-0')}
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
                      chatAnswerContainerInner={chatAnswerContainerInner}
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
                    enableEdit={setting?.questionEditEnable}
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
            (hasTryToAsk || !noChatInput || !noStopResponding) && chatFooterClassName)}
          ref={chatFooterRef}
        >
          <div
            ref={chatFooterInnerRef}
            className={clsx('relative', chatFooterInnerClassName, isTryApp && 'px-0')}
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
            {
              hasTryToAsk && (
                <TryToAsk
                  suggestedQuestions={suggestedQuestions}
                  onSend={onSend}
                />
              )
            }
            {
              !noChatInput && (
                <ChatInputArea
                  botName={appData?.site?.title || 'Bot'}
                  disabled={inputDisabled}
                  speechToTextSetting={setting?.speech_to_text}
                  onSend={onSend}
                  inputs={inputs}
                  inputsForm={inputsForm}
                  theme={themeBuilder?.theme}
                  responding={responding}
                  readonly={readonly}
                  sendOnEnter={sendOnEnter}
                />
              )
            }
          </div>
        </div>
      </div>
    </ChatContextProvider>
  )
})

export default Chat
