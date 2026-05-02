import { createLogger } from '@x-mars/shared'
import { MEMORY_EXTRACTION_PROMPT } from './prompts'
import { messageToText } from './token-estimator'

import type { Message } from '@x-mars/ai'
import type {
  MemoryEntry,
  MemoryType,
  MemoryExtractionConfig,
  MemoryExtractionResult,
  MemoryEntryStore,
} from './types'

const log = createLogger('@x-mars/memory:extraction')

const VALID_TYPES = new Set<MemoryType>(['user', 'feedback', 'project', 'reference'])

export async function extractMemories(
  messages: readonly Message[],
  config: MemoryExtractionConfig,
  signal?: AbortSignal,
): Promise<MemoryEntry[]> {
  if (!config.enabled || messages.length < config.triggerMessageCount) {
    return []
  }

  const conversation = formatConversation(messages)
  const prompt = MEMORY_EXTRACTION_PROMPT.replace('{conversation}', conversation)

  try {
    const response = await config.summarize(prompt, {
      maxTokens: 4096,
      signal,
    })

    const entries = parseExtractionResponse(response)
    log.info('Extracted %d memory entries from conversation', entries.length)
    return entries
  } catch (err) {
    log.warn({ error: err }, 'Memory extraction failed')
    return []
  }
}

export async function extractAndSave(
  messages: readonly Message[],
  store: MemoryEntryStore,
  config: MemoryExtractionConfig,
  signal?: AbortSignal,
): Promise<MemoryExtractionResult> {
  const entries = await extractMemories(messages, config, signal)

  if (entries.length === 0) {
    return { entries: [], indexUpdated: false }
  }

  let saved = 0
  for (const entry of entries) {
    const existing = store.get(entry.name) ?? findSimilarEntry(store, entry)
    if (existing) {
      // 更新已有条目的内容，保留原有文件名
      await store.save({ ...entry, filename: existing.filename })
    } else {
      await store.save(entry)
    }
    saved++
  }

  log.info('Saved %d memory entries to store', saved)
  return { entries, indexUpdated: saved > 0 }
}

function formatConversation(messages: readonly Message[], maxChars = 8000): string {
  const parts: string[] = []
  let totalChars = 0

  for (const msg of messages) {
    const text = messageToText(msg)
    const label = msg.role === 'user' ? 'Human' : msg.role === 'assistant' ? 'Assistant' : 'Tool'
    const formatted = `${label}: ${text}`

    if (totalChars + formatted.length > maxChars) {
      parts.push(`${label}: ${text.slice(0, maxChars - totalChars)}...`)
      break
    }

    parts.push(formatted)
    totalChars += formatted.length
  }

  return parts.join('\n\n')
}

const ENTRY_RE = /NAME:\s*(.+)\nTYPE:\s*(.+)\nDESCRIPTION:\s*(.+)\nCONTENT:\n([\s\S]*?)(?:\nEND|$)/g

export function parseExtractionResponse(response: string): MemoryEntry[] {
  const trimmed = response.trim()
  if (trimmed === 'NONE' || trimmed === '') {
    return []
  }

  const entries: MemoryEntry[] = []

  let match: RegExpExecArray | null
  while ((match = ENTRY_RE.exec(trimmed)) !== null) {
    const name = (match[1] ?? '').trim()
    const type = (match[2] ?? '').trim().toLowerCase() as MemoryType
    const description = (match[3] ?? '').trim()
    const content = (match[4] ?? '').trim()

    if (!VALID_TYPES.has(type) || !name || !content) {
      continue
    }

    const filename = `${type}_${sanitizeName(name)}.md`

    entries.push({ name, type, description, content, filename })
  }

  // 重置正则的 lastIndex，确保可复用
  ENTRY_RE.lastIndex = 0

  return entries
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
}

function findSimilarEntry(store: MemoryEntryStore, entry: MemoryEntry): MemoryEntry | undefined {
  if (!store.list) {
    return undefined
  }

  const entryDescription = normalizeMemoryText(entry.description)
  const entryContent = normalizeMemoryText(entry.content)

  for (const existing of store.list()) {
    if (existing.type !== entry.type) {
      continue
    }

    if (
      normalizeMemoryText(existing.description) === entryDescription ||
      normalizeMemoryText(existing.content) === entryContent
    ) {
      return existing
    }
  }

  return undefined
}

function normalizeMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
