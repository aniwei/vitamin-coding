import { memo } from 'react'
import { Markdown } from '@/components/markdown'
import { clsx } from 'clsx'
import type { FC } from 'react'
import type { ChatItem } from '../types'

type BasicContentProps = {
  item: ChatItem
}

export const BasicContent: FC<BasicContentProps> = memo(({
  item,
}) => {
  const {
    annotation,
    content,
  } = item

  if (annotation?.logAnnotation) {
    return (
      <Markdown
        content={annotation?.logAnnotation.content || ''}
        data-testid="basic-content-markdown"
      />
    )
  }

  let displayContent = content
  if (typeof content === 'string' && /^\\\\\S.*/.test(content) && !/^`.*`$/.test(content)) {
    displayContent = `\`${content}\``
  }

  return (
    <Markdown
      className={clsx(
        item.isError && 'text-[#F04438]!',
      )}
      content={displayContent}
    />
  )
})

BasicContent.displayName = 'BasicContent'
export default BasicContent
