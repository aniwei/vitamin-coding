import RemarkBreaks from 'remark-breaks'
import { createMathPlugin } from '@streamdown/math'
import { lazy, memo, useMemo } from 'react'
import {
  defaultRehypePlugins, 
  defaultRemarkPlugins, 
  Streamdown 
} from 'streamdown'
import {
  Image,
  Link,
  Audio,
  Button,
  Form,
  Paragraph,
  PluginImage,
  PluginParagraph,
  Think,
  Video,
} from './blocks'
import { getAllowedTagAttributes, getAllowedTagNames, urlTransform } from './shared'
import type { ComponentType } from 'react'
import type { Components, StreamdownProps } from 'streamdown'

import 'katex/dist/katex.min.css'

type PluggableList = NonNullable<StreamdownProps['rehypePlugins']>
type Pluggable = PluggableList[number]

type AttributeDefinition = string | [string, ...(string | boolean | RegExp)[]]

interface SanitizeSchema {
  tagNames?: string[]
  attributes?: Record<string, AttributeDefinition[]>
  required?: Record<string, Record<string, unknown>>
  clobber?: string[]
  clobberPrefix?: string
  [key: string]: unknown
}

const Code = lazy(() => import('./blocks/code'))

const mathPlugin = createMathPlugin({
  singleDollarTextMath: false,
})

function buildRehypePlugins(extraPlugins?: PluggableList): PluggableList {
  const [sanitizePlugin, defaultSanitizeSchema]
    = defaultRehypePlugins.sanitize as [Pluggable, SanitizeSchema]
  const allowedTagNames = getAllowedTagNames()

  const tagNamesSet = new Set([
    ...(defaultSanitizeSchema.tagNames ?? []),
    ...allowedTagNames,
  ])

  const mergedAttributes: Record<string, AttributeDefinition[]> = {
    ...(defaultSanitizeSchema.attributes ?? {}),
  }

  for (const tag of allowedTagNames) {
    const tagAllowedAttributes = getAllowedTagAttributes(tag)
    const existing = mergedAttributes[tag]

    if (existing) {
      const overrideNames = new Set(tagAllowedAttributes)
      const filtered = existing.filter((entry) => {
        const name = typeof entry === 'string' ? entry : entry[0]
        return !overrideNames.has(name as string)
      })

      mergedAttributes[tag] = [...filtered, ...tagAllowedAttributes]
    } else {
      mergedAttributes[tag] = tagAllowedAttributes
    }
  }

  const { input: _inputRequired, ...requiredRest } = (defaultSanitizeSchema.required ?? {})
  const clobber = (defaultSanitizeSchema.clobber ?? []).filter(k => k !== 'name')

  const globalAttrs = mergedAttributes['*'] ?? []
  mergedAttributes['*'] = [...globalAttrs, 'style']

  const customSchema: SanitizeSchema = {
    ...defaultSanitizeSchema,
    tagNames: [...tagNamesSet],
    attributes: mergedAttributes,
    required: requiredRest,
    clobber,
  }

  return [
    defaultRehypePlugins.raw,
    ...(extraPlugins ?? []),
    [sanitizePlugin, customSchema] as Pluggable,
    defaultRehypePlugins.harden,
  ]
}

export interface SimplePluginInfo {
  pluginUniqueIdentifier: string
  pluginId: string
}

export interface StreamdownWrapperProps {
  latexContent: string
  disallowedTags?: string[]
  customComponents?: Components
  pluginInfo?: SimplePluginInfo
  remarkPlugins?: StreamdownProps['remarkPlugins']
  rehypePlugins?: StreamdownProps['rehypePlugins']
  animating?: boolean
  className?: string
  mode?: StreamdownProps['mode']
}

const useComponents = (
  pluginInfo?: SimplePluginInfo, 
  customComponents?: Components
) => {
  return  useMemo(() => {
    const Img = (props: { src?: string }) => pluginInfo 
      ? <PluginImage 
        src={String(props.src ?? '')} 
        pluginInfo={pluginInfo} 
      /> 
      : <Image src={String(props.src ?? '')} />
    

    const P = (props: { children?: React.ReactNode, node?: any }) => pluginInfo 
      ? <PluginParagraph {...props} data={undefined} pluginInfo={pluginInfo} /> 
      : <Paragraph {...props} />


    return {
      code: Code,
      video: Video as ComponentType,
      audio: Audio as ComponentType,
      a: Link as ComponentType,
      img: Img,
      p: P,
      button: Button as ComponentType,
      form: Form as ComponentType,
      details: Think as ComponentType,
      ...customComponents,
    }
  }, [pluginInfo, customComponents])
}

const StreamdownWrapper: React.FC<StreamdownWrapperProps> = memo((props) => {
  const {
    customComponents,
    latexContent,
    pluginInfo,
    animating,
    className,
    mode = 'streaming',
  } = props

  const remarkPlugins = useMemo(() => [
    [Array.isArray(defaultRemarkPlugins.gfm) 
      ? defaultRemarkPlugins.gfm[0] 
      : defaultRemarkPlugins.gfm, { singleTilde: false }] as Pluggable,
    RemarkBreaks,
    ...(props.remarkPlugins ?? []),
  ], [props.remarkPlugins])

  const rehypePlugins = useMemo(() => buildRehypePlugins(props.rehypePlugins), [props.rehypePlugins])
  const plugins = useMemo(() => ({ math: mathPlugin }), [])

  const disallowedTags = useMemo(() => {
    return ['iframe', 'head', 'html', 'meta', 'link', 'style', 'body', ...(props.disallowedTags || [])]
  }, [props.disallowedTags])

  const components = useComponents(
    pluginInfo, 
    customComponents
  )

  return (
    <Streamdown
      className={className}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      plugins={plugins}
      urlTransform={urlTransform}
      disallowedElements={disallowedTags}
      components={components}
      isAnimating={animating}
      mode={mode}
    >{latexContent}</Streamdown>
  )
})

export default StreamdownWrapper
