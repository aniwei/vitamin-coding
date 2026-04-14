import Thought from '@/components/chat/thought'
import { memo } from 'react'
import { Markdown } from '@/components/markdown'
import type { FC } from 'react'
import type { ChatItem } from '../types'

type AgentContentProps = {
  item: ChatItem
  responding?: boolean
  content?: string
}

export const AgentContent: FC<AgentContentProps> = memo(({
  item,
  responding,
  content,
}) => {
  const {
    annotation,
    agent_thoughts,
  } = item

  if (annotation?.logAnnotation) {
    return (
      <Markdown content={annotation?.logAnnotation.content || ''} />
    )
  }

  return (
    <div data-testid="agent-content-container">
      {
        content 
          ? <Markdown content={content} />
          : agent_thoughts?.map((thought, index) => (
            <div key={index} className="px-2 py-1">
              { thought.thought && <Markdown content={thought.thought} /> }
              
              {
                !!thought.tool && <Thought
                  thought={thought}
                  isFinished={!!thought.observation || !responding}
                />
              }
            </div>
          ))
      }
    </div>
  )
})

AgentContent.displayName = 'AgentContent'
export default AgentContent
