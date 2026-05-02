import type {
  PromptAssembly,
  PromptAssemblyDiagnostics,
  PromptSection,
  PromptSectionDiagnostic,
  PromptSectionInput,
  PromptSectionLayer,
} from './types'

const DEFAULT_LAYER: PromptSectionLayer = 'dynamic'

export function createPromptSection(input: PromptSectionInput): PromptSection {
  const layer = input.layer ?? DEFAULT_LAYER
  const content = input.content.trim()
  return {
    key: input.key,
    content,
    layer,
    cacheable: input.cacheable ?? layer !== 'dynamic',
    source: input.source ?? 'runtime',
    priority: input.priority ?? 50,
    fingerprint: fingerprintPromptSection(input.key, content),
  }
}

export function assemblePromptSections(inputs: PromptSectionInput[]): PromptAssembly {
  const sections = inputs
    .map(createPromptSection)
    .filter((section) => section.content.length > 0)
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))

  const systemPrompt = renderPromptSections(sections)
  const staticPrefix = renderPromptSections(sections.filter((section) => section.cacheable))
  const dynamicTail = renderPromptSections(sections.filter((section) => !section.cacheable))
  const diagnostics = buildPromptDiagnostics(sections)

  return {
    sections,
    systemPrompt,
    staticPrefix,
    dynamicTail,
    diagnostics,
  }
}

export function renderPromptSections(sections: readonly Pick<PromptSection, 'content'>[]): string {
  return sections
    .map((section) => section.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function appendPromptSection(
  assembly: PromptAssembly,
  section: PromptSectionInput,
): PromptAssembly {
  return assemblePromptSections([...assembly.sections, section])
}

export function isPromptAssembly(value: unknown): value is PromptAssembly {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<PromptAssembly>
  return (
    Array.isArray(candidate.sections) &&
    typeof candidate.systemPrompt === 'string' &&
    typeof candidate.staticPrefix === 'string' &&
    typeof candidate.dynamicTail === 'string' &&
    typeof candidate.diagnostics === 'object'
  )
}

function buildPromptDiagnostics(sections: PromptSection[]): PromptAssemblyDiagnostics {
  const sectionDiagnostics = sections.map(toSectionDiagnostic)
  const totalChars = sections.reduce((sum, section) => sum + section.content.length, 0)
  return {
    sectionCount: sections.length,
    totalChars,
    estimatedTokens: estimateTokensFromChars(totalChars),
    sections: sectionDiagnostics,
  }
}

function toSectionDiagnostic(section: PromptSection): PromptSectionDiagnostic {
  return {
    key: section.key,
    layer: section.layer,
    cacheable: section.cacheable,
    source: section.source,
    priority: section.priority,
    chars: section.content.length,
    estimatedTokens: estimateTokensFromChars(section.content.length),
    fingerprint: section.fingerprint,
  }
}

function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4)
}

function fingerprintPromptSection(key: string, content: string): string {
  let hash = 5381
  const input = `${key}\0${content}`
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
