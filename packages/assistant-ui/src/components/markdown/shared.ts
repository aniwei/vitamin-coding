import { flow } from 'es-toolkit/compat'

const validPrefixes = ['http:', 'https:', '//', 'mailto:', 'data:']
export const isValidUrl = (url: string): boolean => {
  return validPrefixes.some(prefix => url.startsWith(prefix))
}

const permittedSchemeRegex = /^(https?|ircs?|mailto|xmpp|abbr):$/i

export const isPermittedScheme = (scheme: string): boolean => {
  return permittedSchemeRegex.test(scheme)
}

export const urlTransform = (uri: string): string | undefined => {
  if (uri.startsWith('#'))
    return uri

  if (uri.startsWith('//'))
    return uri

  const colonIndex = uri.indexOf(':')
  if (colonIndex === -1)
    return uri

  const slashIndex = uri.indexOf('/')
  const questionMarkIndex = uri.indexOf('?')
  const hashIndex = uri.indexOf('#')

  if (
    (slashIndex !== -1 && colonIndex > slashIndex)
    || (questionMarkIndex !== -1 && colonIndex > questionMarkIndex)
    || (hashIndex !== -1 && colonIndex > hashIndex)
  ) {
    return uri
  }

  const scheme = uri.substring(0, colonIndex + 1).toLowerCase()
  if (isPermittedScheme(scheme))
    return uri

  if (scheme === 'data:')
    return uri

  return undefined
}

// ─── Markdown Preprocessing ──────────────────────────────────────────

export const preprocessLaTeX = (content: string) => {
  if (typeof content !== 'string')
    return content

  const codeBlockRegex = /```[\s\S]*?```/g
  const codeBlocks = content.match(codeBlockRegex) || []
  const escapeReplacement = (str: string) => str.replace(/\$/g, '_TMP_REPLACE_DOLLAR_')
  let processedContent = content.replace(codeBlockRegex, 'CODE_BLOCK_PLACEHOLDER')

  processedContent = flow([
    (str: string) => str.replace(/\\\[(.*?)\\\]/g, (_, equation) => `$$${equation}$$`),
    (str: string) => str.replace(/\\\[([\s\S]*?)\\\]/g, (_, equation) => `$$${equation}$$`),
    (str: string) => str.replace(/\\\((.*?)\\\)/g, (_, equation) => `$$${equation}$$`),
    (str: string) => str.replace(/(^|[^\\])\$(.+?)\$/g, (_, prefix, equation) => `${prefix}$${equation}$`),
  ])(processedContent)

  codeBlocks.forEach((block) => {
    processedContent = processedContent.replace('CODE_BLOCK_PLACEHOLDER', escapeReplacement(block))
  })

  processedContent = processedContent.replace(/_TMP_REPLACE_DOLLAR_/g, '$')

  return processedContent
}

export const preprocessThinkTag = (content: string) => {
  const thinkOpenTagRegex = /(<think>\s*)+/g
  const thinkCloseTagRegex = /(\s*<\/think>)+/g
  return flow([
    (str: string) => str.replace(thinkOpenTagRegex, '<details data-think=true>\n'),
    (str: string) => str.replace(thinkCloseTagRegex, '\n[ENDTHINKFLAG]</details>'),
    (str: string) => str.replace(/(<\/details>)(?![^\S\r\n]*[\r\n])(?![^\S\r\n]*$)/g, '$1\n'),
  ])(content)
}

// ─── Allowed Tags / Sanitize ─────────────────────────────────────────

const allowedTags: Record<string, string[]> = {
  button: ['dataVariant', 'dataSize', 'dataMessage', 'dataLink'],
  form: ['dataFormat'],
  input: ['type', 'name', 'value', 'placeholder', 'checked', 'dataTip', 'dataOptions'],
  textarea: ['name', 'placeholder', 'value'],
  label: ['htmlFor'],
  details: ['dataThink'],
  video: ['src'],
  audio: ['src'],
  source: ['src'],
  mark: [],
  sub: [],
  sup: [],
  kbd: [],
  // custom tags from human input node
  variable: ['dataPath'],
  section: ['dataName'],
}

export const getAllowedTagNames = (): string[] => {
  return Object.keys(allowedTags)
}

export const getAllowedTagAttributes = (tagName: string): string[] => {
  return allowedTags[tagName] ?? []
}

export const isAllowedTag = (
  tagName: string, 
  properties: Record<string, any>
): boolean => {
  const hasTag = Object.prototype.hasOwnProperty.call(allowedTags, tagName)
  if (!hasTag) {
    return false
  }

  const allowedAttributes = getAllowedTagAttributes(tagName)

  for (const key in properties) {
    if (!allowedAttributes.includes(key)) {
      return false
    }
  }

  return true
}

const validButtonVariants = new Set<string>([
  'primary',
  'warning',
  'secondary',
  'secondary-accent',
  'ghost',
  'ghost-accent',
  'tertiary',
])

export const isValidButtonVariant = (variant: string): boolean => {
  return validButtonVariants.has(variant)
}

// ─── DOM / HAST Utilities ────────────────────────────────────────────

interface MdastNode {
  tagName?: string
  children?: MdastNode[]
  [key: string]: unknown
}

export const hasImageChild = (children: MdastNode[] | undefined): boolean => {
  return children?.some((child) => {
    if (child.tagName === 'img')
      return true
    return child.children ? hasImageChild(child.children) : false
  }) ?? false
}

export const getMarkdownImageURL = (src: string, _pluginId?: string): string => {
  if (isValidUrl(src))
    return src
  return src
}