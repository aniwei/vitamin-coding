import type { AgentSpec, SubagentResult, ToolRegistryHandle } from './types'

const SUBAGENT_STATUS_PATTERN = /^(?:status:\s*)?(done_with_concerns|needs_context|blocked|done)\b/i

export function resolveAgentTools(
  spec: AgentSpec,
  toolRegistry: ToolRegistryHandle,
): unknown[] | undefined {
  return spec.tools ? toolRegistry.filterByNames(spec.tools) : undefined
}

export function parseSubagentResult(output: string): SubagentResult | undefined {
  const trimmed = output.trim()
  if (!trimmed) {
    return undefined
  }

  const lines = trimmed.split(/\r?\n/)
  const firstLine = lines[0]?.trim()
  if (!firstLine) {
    return undefined
  }

  const match = firstLine.match(SUBAGENT_STATUS_PATTERN)
  if (!match) {
    return undefined
  }

  const status = match[1]?.toLowerCase() as SubagentResult['status'] | undefined
  if (!status) {
    return undefined
  }

  const detail = lines.slice(1).join('\n').trim() || undefined

  // 提取结构化段落（## Changed Files, ## Verification, ## Risks）
  const structured = extractStructuredSections(trimmed)

  switch (status) {
    case 'done':
      return { status, output: trimmed, ...structured }
    case 'done_with_concerns':
      return { status, output: trimmed, concerns: detail, ...structured }
    case 'needs_context':
      return { status, output: trimmed, missingContext: detail, ...structured }
    case 'blocked':
      return { status, output: trimmed, blockReason: detail, ...structured }
  }
}

const SECTION_HEADING = /^#{1,3}\s+(.+)$/

function extractStructuredSections(text: string): Pick<SubagentResult, 'changedFiles' | 'verificationPerformed' | 'risksOrConcerns'> {
  const result: Pick<SubagentResult, 'changedFiles' | 'verificationPerformed' | 'risksOrConcerns'> = {}
  const lines = text.split(/\r?\n/)
  let currentSection = ''
  let sectionLines: string[] = []

  const flushSection = () => {
    const body = sectionLines.join('\n').trim()
    if (!body) return
    const key = currentSection.toLowerCase()
    if (key.includes('changed file') || key.includes('files changed')) {
      result.changedFiles = body.split(/\r?\n/).map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
    } else if (key.includes('verification') || key.includes('test')) {
      result.verificationPerformed = body
    } else if (key.includes('risk') || key.includes('concern')) {
      result.risksOrConcerns = body
    }
  }

  for (const line of lines) {
    const heading = line.match(SECTION_HEADING)
    if (heading) {
      flushSection()
      currentSection = heading[1]!
      sectionLines = []
    } else {
      sectionLines.push(line)
    }
  }
  flushSection()

  return result
}