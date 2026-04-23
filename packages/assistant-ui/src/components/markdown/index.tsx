import { clsx } from 'clsx'
import { flow } from 'es-toolkit/compat'
import { memo, useMemo, lazy } from 'react'
import { preprocessLaTeX, preprocessThinkTag } from './shared'
import type { SimplePluginInfo, StreamdownWrapperProps } from './streamdown-wrapper'

const StreamdownWrapper = lazy(() => import('./streamdown-wrapper'))

const preprocess = flow([preprocessThinkTag, preprocessLaTeX])

const EMPTY_COMPONENTS = {} as const

export interface MarkdownProps extends Omit<StreamdownWrapperProps, 'latexContent'> {
  content: string
  className?: string
  pluginInfo?: SimplePluginInfo
}

export const Markdown: React.FC<MarkdownProps> = memo((props) => {
  const {
    content,
    customComponents = EMPTY_COMPONENTS,
    pluginInfo,
    animating,
    disallowedTags,
    remarkPlugins,
    rehypePlugins,
    mode,
    className,
  } = props

  const latexContent = useMemo(() => preprocess(content), [content])

  return (
    <div 
      className={clsx(
        'markdown-body', 
        'text-text-primary!', 
        className
      )}
    >
      <StreamdownWrapper
        mode={mode}
        pluginInfo={pluginInfo}
        latexContent={latexContent}
        customComponents={customComponents}
        disallowedTags={disallowedTags}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        animating={animating}
      />
    </div>
  )
})

Markdown.displayName = 'Markdown'

export default Markdown
