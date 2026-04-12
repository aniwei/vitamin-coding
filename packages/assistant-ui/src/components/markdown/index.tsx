import type { SimplePluginInfo, StreamdownWrapperProps } from './streamdown-wrapper'
import { flow } from 'es-toolkit/compat'
import { memo, useMemo, lazy } from 'react'
import { clsx } from 'clsx'
import { preprocessLaTeX, preprocessThinkTag } from './markdown-utils'

const StreamdownWrapper = lazy(() => import('./streamdown-wrapper'))

const preprocess = flow([preprocessThinkTag, preprocessLaTeX])

const EMPTY_COMPONENTS = {} as const

export type MarkdownProps = {
  content: string
  className?: string
  pluginInfo?: SimplePluginInfo
} & Pick<
  StreamdownWrapperProps,
  'customComponents' | 'customDisallowedElements' | 'remarkPlugins' | 'rehypePlugins' | 'isAnimating' | 'mode'
>

export const Markdown = memo((props: MarkdownProps) => {
  const {
    content,
    customComponents = EMPTY_COMPONENTS,
    pluginInfo,
    isAnimating,
    customDisallowedElements,
    remarkPlugins,
    rehypePlugins,
    mode,
    className,
  } = props
  const latexContent = useMemo(() => preprocess(content), [content])

  return (
    <div className={clsx('markdown-body', 'text-text-primary!', className)} data-testid="markdown-body">
      <StreamdownWrapper
        pluginInfo={pluginInfo}
        latexContent={latexContent}
        customComponents={customComponents}
        customDisallowedElements={customDisallowedElements}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        isAnimating={isAnimating}
        mode={mode}
      />
    </div>
  )
})

Markdown.displayName = 'Markdown'
