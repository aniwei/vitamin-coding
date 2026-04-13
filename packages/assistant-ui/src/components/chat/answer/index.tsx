
import AnswerIcon from './answer-icon'
import Citation from '../citation'
import LoadingAnimation from '../loading-animation'
import ContentSwitch from '../content-switch'
// import AgentContent from './agent-content'
// import BasicContent from './basic-content'
// import HumanInputFilledFormList from './human-input-filled-form-list'
// import HumanInputFormList from './human-input-form-list'
import More from './more'
// import Operation from './operation'
import SuggestedQuestions from './suggested-questions'
import WorkflowProcessItem from './workflow-process'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useChatContext } from '../context'

import type {
  FC,
  ReactNode,
} from 'react'
import type {
  ChatSetting,
  ChatItem,
} from '../types'

interface AnswerProps {
  item: ChatItem
  question: string
  index: number
  setting?: ChatSetting
  answerIcon?: ReactNode
  responding?: boolean
  showPromptLog?: boolean
  answerContainerInner?: string
  hideProcessDetail?: boolean
  noChatInput?: boolean
  hideAvatar?: boolean
  switchSibling?: (siblingMessageId: string) => void
  onHumanInputFormSubmit?: (formToken: string, formData: any) => Promise<void>
}

export const Answer: FC<AnswerProps> = memo(({
  item,
  question,
  index,
  setting,
  answerIcon,
  responding,
  showPromptLog,
  answerContainerInner,
  hideProcessDetail,
  noChatInput,
  switchSibling,
  hideAvatar,
  onHumanInputFormSubmit,
}) => {
  const {
    content,
    citation,
    agent_thoughts,
    more,
    annotation,
    workflowProcess,
    humanInputFormDataList,
    humanInputFilledFormDataList,
  } = item
  const hasAgentThoughts = !!agent_thoughts?.length
  const hasHumanInputs = !!humanInputFormDataList?.length || !!humanInputFilledFormDataList?.length

  const [containerWidth, setContainerWidth] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const [humanInputFormContainerWidth, setHumanInputFormContainerWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const humanInputFormContainerRef = useRef<HTMLDivElement>(null)

  const {
    getHumanInputNodeData,
  } = useChatContext()

  const getContainerWidth = () => {
    if (containerRef.current)
      setContainerWidth(containerRef.current?.clientWidth + 16)
  }
  useEffect(() => {
    getContainerWidth()
  }, [])

  const getContentWidth = () => {
    if (contentRef.current)
      setContentWidth(contentRef.current?.clientWidth)
  }

  useEffect(() => {
    if (!responding)
      getContentWidth()
  }, [responding])

  const getHumanInputFormContainerWidth = () => {
    if (humanInputFormContainerRef.current)
      setHumanInputFormContainerWidth(humanInputFormContainerRef.current?.clientWidth)
  }

  useEffect(() => {
    if (hasHumanInputs)
      getHumanInputFormContainerWidth()
  }, [hasHumanInputs])

  // Recalculate contentWidth when content changes (e.g., SVG preview/source toggle)
  useEffect(() => {
    if (!containerRef.current)
      return
    const resizeObserver = new ResizeObserver(() => {
      getContentWidth()
      getHumanInputFormContainerWidth()
    })
    resizeObserver.observe(containerRef.current)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

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

  const contentIsEmpty = typeof content === 'string' && content.trim() === ''

  return (
    <div className="mb-2 flex last:mb-0">
      {!hideAvatar && (
        <div className="relative h-10 w-10 shrink-0">
          {answerIcon || <AnswerIcon />}
          {responding && (
            <div className="absolute left-[-3px] top-[-3px] flex h-4 w-4 items-center rounded-full border-[0.5px] border-divider-subtle bg-background-section-burn pl-[6px] shadow-xs">
              <LoadingAnimation type="avatar" />
            </div>
          )}
        </div>
      )}
      <div className="chat-answer-container group ml-4 w-0 grow pb-4" ref={containerRef} data-testid="chat-answer-container">
        {/* Block 1: Workflow Process + Human Input Forms */}
        {hasHumanInputs && (
          <div className={clsx('group relative pr-10', answerContainerInner)} data-testid="chat-answer-container-humaninput">
            <div
              ref={humanInputFormContainerRef}
              className={clsx('relative inline-block w-full max-w-full rounded-2xl bg-chat-bubble-bg px-4 py-3 text-text-primary body-lg-regular')}
            >
              {/* {
                !responding && contentIsEmpty && !hasAgentThoughts && (
                  <Operation
                    hasWorkflowProcess={!!workflowProcess}
                    maxSize={containerWidth - humanInputFormContainerWidth - 4}
                    contentWidth={humanInputFormContainerWidth}
                    item={item}
                    question={question}
                    index={index}
                    showPromptLog={showPromptLog}
                    noChatInput={noChatInput}
                  />
                )
              } */}
              {/** Render workflow process */}
              {/* {
                workflowProcess && (
                  <WorkflowProcessItem
                    data={workflowProcess}
                    item={item}
                    hideProcessDetail={hideProcessDetail}
                    readonly={hideProcessDetail ? undefined : undefined}
                  />
                )
              } */}
              {/* {
                humanInputFormDataList && humanInputFormDataList.length > 0 && (
                  <HumanInputFormList
                    humanInputFormDataList={humanInputFormDataList}
                    onHumanInputFormSubmit={onHumanInputFormSubmit}
                    getHumanInputNodeData={getHumanInputNodeData}
                  />
                )
              }
              {
                humanInputFilledFormDataList && humanInputFilledFormDataList.length > 0 && (
                  <HumanInputFilledFormList
                    humanInputFilledFormDataList={humanInputFilledFormDataList}
                  />
                )
              } */}
              {
                typeof item.siblingCount === 'number'
                && item.siblingCount > 1
                && !responding
                && contentIsEmpty
                && !hasAgentThoughts
                && (
                  <ContentSwitch
                    count={item.siblingCount}
                    currentIndex={item.siblingIndex}
                    prevDisabled={!item.prevSibling}
                    nextDisabled={!item.nextSibling}
                    switchSibling={handleSwitchSibling}
                  />
                )
              }
            </div>
          </div>
        )}

        {/* Block 2: Response Content (when human inputs exist) */}
        {hasHumanInputs && (responding || !contentIsEmpty || hasAgentThoughts) && (
          <div className={clsx('group relative mt-2 pr-10', answerContainerInner)}>
            <div className="absolute -top-2 left-6 h-3 w-0.5 bg-chat-answer-human-input-form-divider-bg" />
            <div
              ref={contentRef}
              className="relative inline-block w-full max-w-full rounded-2xl bg-chat-bubble-bg px-4 py-3 text-text-primary body-lg-regular"
            >
              {/* {
                !responding && (
                  <Operation
                    hasWorkflowProcess={!!workflowProcess}
                    maxSize={containerWidth - contentWidth - 4}
                    contentWidth={contentWidth}
                    item={item}
                    question={question}
                    index={index}
                    showPromptLog={showPromptLog}
                    noChatInput={noChatInput}
                  />
                )
              } */}
              {
                responding && contentIsEmpty && !hasAgentThoughts && (
                  <div className="flex h-5 w-6 items-center justify-center">
                    <LoadingAnimation type="text" />
                  </div>
                )
              }
              {/* {
                !contentIsEmpty && !hasAgentThoughts && (
                  <BasicContent item={item} />
                )
              } */}
              {/* {
                hasAgentThoughts && (
                  <AgentContent
                    item={item}
                    responding={responding}
                    content={content}
                  />
                )
              } */}
              
              <SuggestedQuestions item={item} />
              {
                !!citation?.length && !responding && (
                  <Citation data={citation} showHitInfo={setting?.supportCitationHitInfo} />
                )
              }
              {
                typeof item.siblingCount === 'number'
                && item.siblingCount > 1
                && (
                  <ContentSwitch
                    count={item.siblingCount}
                    currentIndex={item.siblingIndex}
                    prevDisabled={!item.prevSibling}
                    nextDisabled={!item.nextSibling}
                    switchSibling={handleSwitchSibling}
                  />
                )
              }
            </div>
          </div>
        )}

        {/* Original single block layout (when no human inputs) */}
        {!hasHumanInputs && (
          <div className={clsx('group relative pr-10', answerContainerInner)} data-testid="chat-answer-container-inner">
            <div
              ref={contentRef}
              className={clsx(
                'relative inline-block max-w-full rounded-2xl bg-chat-bubble-bg px-4 py-3 text-text-primary body-lg-regular', 
                workflowProcess && 'w-full'
              )}
            >
              {/* {
                !responding && (
                  <Operation
                    hasWorkflowProcess={!!workflowProcess}
                    maxSize={containerWidth - contentWidth - 4}
                    contentWidth={contentWidth}
                    item={item}
                    question={question}
                    index={index}
                    showPromptLog={showPromptLog}
                    noChatInput={noChatInput}
                  />
                )
              } */}
              {/** Render workflow process */}
              {/* {
                workflowProcess && (
                  <WorkflowProcessItem
                    data={workflowProcess}
                    item={item}
                    hideProcessDetail={hideProcessDetail}
                    readonly={hideProcessDetail ? undefined : undefined}
                  />
                )
              } */}
              {
                responding && contentIsEmpty && !hasAgentThoughts && (
                  <div className="flex h-5 w-6 items-center justify-center">
                    <LoadingAnimation type="text" />
                  </div>
                )
              }
              {/* {
                !contentIsEmpty && !hasAgentThoughts && (
                  <BasicContent item={item} />
                )
              } */}
              {/* {
                hasAgentThoughts && (
                  <AgentContent
                    item={item}
                    responding={responding}
                    content={content}
                  />
                )
              } */}
              
              <SuggestedQuestions item={item} />
              {
                !!citation?.length && !responding && (
                  <Citation data={citation} showHitInfo={setting?.supportCitationHitInfo} />
                )
              }
              {
                typeof item.siblingCount === 'number' && item.siblingCount > 1 && (
                  <ContentSwitch
                    count={item.siblingCount}
                    currentIndex={item.siblingIndex}
                    prevDisabled={!item.prevSibling}
                    nextDisabled={!item.nextSibling}
                    switchSibling={handleSwitchSibling}
                  />
                )
              }
            </div>
          </div>
        )}

        <More more={more} />
      </div>
    </div>
  )
})

export default Answer
