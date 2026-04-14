import * as React from 'react'
import { Markdown } from '@/components/markdown'

type SubmittedContentProps = {
  content: string
}

export const SubmittedContent: React.FC<SubmittedContentProps> = ({
  content,
}) => {
  return (
    <div>
      <Markdown content={content} />
    </div>
  )
}

SubmittedContent.displayName = 'SubmittedContent'
export default React.memo(SubmittedContent)
