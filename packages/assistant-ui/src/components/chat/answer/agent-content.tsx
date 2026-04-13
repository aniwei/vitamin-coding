import type { FC } from 'react'
import type {
  ChatItem,
} from '../../types'
import { memo } from 'react'
import Thought from '@/components/chat/chat/thought'
import { FileList } from '@/components/file-uploader'
import { getProcessedFilesFromResponse } from '@/components/file-uploader/utils'
import { Markdown } from '@/components/markdown'

type AgentContentProps = {
  item: ChatItem
  responding?: boolean
  content?: string
}
const AgentContent: FC<AgentContentProps> = ({
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
      <Markdown
        content={annotation?.logAnnotation.content || ''}
        data-testid="agent-content-markdown"
      />
    )
  }

  return (
    <div data-testid="agent-content-container">
      {content ? (
        <Markdown
          content={content}
          data-testid="agent-content-markdown"
        />
      ) : agent_thoughts?.map((thought, index) => (
        <div key={index} className="px-2 py-1" data-testid="agent-thought-item">
          {thought.thought && (
            <Markdown
              content={thought.thought}
              data-testid="agent-thought-markdown"
            />
          )}
          {/* {item.tool} */}
          {/* perhaps not use tool */}
          {!!thought.tool && (
            <Thought
              thought={thought}
              isFinished={!!thought.observation || !responding}
            />
          )}

          {
            !!thought.message_files?.length && (
              <FileList
                files={getProcessedFilesFromResponse(thought.message_files.map((item: any) => ({ ...item, related_id: item.id })))}
                showDeleteAction={false}
                showDownloadAction={true}
                canPreview={true}
              />
            )
          }
        </div>
      ))}
    </div>
  )
}

export default memo(AgentContent)
