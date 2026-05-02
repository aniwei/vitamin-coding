import { createLogger } from '@x-mars/shared'
import { SEMANTIC_RETRIEVAL_PROMPT, buildLayeredMemoryInjection } from './prompts'
import { messageToText } from './token-estimator'

import type { Message } from '@x-mars/ai'
import type {
  MemoryEntry,
  SemanticRetrievalConfig,
  SemanticRetrievalOptions,
  SemanticRetrievalQuality,
} from './types'

const log = createLogger('@x-mars/memory:semantic-retrieval')

export async function retrieveRelevantMemories(
  entries: MemoryEntry[],
  messages: readonly Message[],
  config: SemanticRetrievalConfig,
  options?: SemanticRetrievalOptions,
): Promise<MemoryEntry[]> {
  if (!config.enabled || entries.length === 0) {
    return entries
  }

  const maxResults = options?.maxResults ?? config.maxResults

  if (entries.length <= maxResults) {
    return entries
  }

  const context = buildConversationContext(messages)
  const memoriesList = entries.map((e) => `- ${e.name} [${e.type}]: ${e.description}`).join('\n')

  const prompt = SEMANTIC_RETRIEVAL_PROMPT.replace('{maxResults}', String(maxResults))
    .replace('{memories}', memoriesList)
    .replace('{context}', context)

  try {
    const response = await config.summarize(prompt, {
      maxTokens: 1024,
      signal: options?.signal,
    })

    const selectedNames = parseRetrievalResponse(response)

    if (selectedNames.length === 0) {
      log.debug('Semantic retrieval returned no matches, returning all entries')
      return entries.slice(0, maxResults)
    }

    const nameSet = new Set(selectedNames)
    const selected = entries.filter((e) => nameSet.has(e.name))

    // 保持 LLM 排序的原始顺序
    const ordered = selectedNames
      .map((name) => selected.find((e) => e.name === name))
      .filter((e): e is MemoryEntry => e !== undefined)
      .slice(0, maxResults)

    log.info('Semantic retrieval: %d/%d entries selected', ordered.length, entries.length)
    if (options?.expectedNames) {
      const quality = evaluateSemanticRetrieval(ordered, options.expectedNames, maxResults)
      log.info(
        'Semantic retrieval quality: precision=%d recall=%d',
        quality.precision,
        quality.recall,
      )
    }
    return ordered
  } catch (err) {
    log.warn({ error: err }, 'Semantic retrieval failed, falling back to all entries')
    return entries.slice(0, maxResults)
  }
}

export function buildInjectionFromRetrieved(entries: MemoryEntry[]): string {
  return buildLayeredMemoryInjection(entries)
}

export function evaluateSemanticRetrieval(
  returnedEntries: MemoryEntry[],
  expectedNames: string[],
  requested: number,
): SemanticRetrievalQuality {
  const returned = returnedEntries.map((entry) => entry.name)
  const returnedSet = new Set(returned)
  const expectedSet = new Set(expectedNames)
  const relevant = returned.filter((name) => expectedSet.has(name))
  const missing = expectedNames.filter((name) => !returnedSet.has(name))
  const unexpected = returned.filter((name) => !expectedSet.has(name))

  return {
    requested,
    returned: returned.length,
    expected: expectedNames.length,
    relevant: relevant.length,
    precision: returned.length === 0 ? 0 : relevant.length / returned.length,
    recall: expectedNames.length === 0 ? 1 : relevant.length / expectedNames.length,
    missing,
    unexpected,
  }
}

function buildConversationContext(messages: readonly Message[], maxChars = 4000): string {
  const recent = messages.slice(-10)
  const parts: string[] = []
  let totalChars = 0

  for (let i = recent.length - 1; i >= 0; i--) {
    const message = recent[i]
    if (!message) {
      continue
    }
    const text = messageToText(message)
    if (totalChars + text.length > maxChars) {
      break
    }
    parts.unshift(`[${message.role}]: ${text.slice(0, 500)}`)
    totalChars += text.length
  }

  return parts.join('\n\n')
}

function parseRetrievalResponse(response: string): string[] {
  const trimmed = response.trim()
  if (trimmed === 'NONE' || trimmed === '') {
    return []
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== 'NONE')
}
