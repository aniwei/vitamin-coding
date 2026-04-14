const validPrefixes = ['http:', 'https:', '//', 'mailto:', 'data:']
export const isValidUrl = (url: string): boolean => {
  return validPrefixes.some(prefix => url.startsWith(prefix))
}

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

export const isAllowedTag = (
  tagName: string, 
  properties: Record<string, any>
): boolean => {
  const allowedAttributes = allowedTags[tagName]
  if (!allowedAttributes) {
    return false
  }

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