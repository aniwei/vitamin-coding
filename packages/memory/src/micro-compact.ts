import { createLogger } from '@x-mars/shared'
import {
  estimateTokens as defaultEstimateTokens,
  estimateMessagesTokens,
  messageToText,
} from './token-estimator'
import {
  resolveContextSize,
  DEFAULT_TIME_MICRO_CONFIG,
  DEFAULT_CACHED_MICRO_CONFIG,
} from './defaults'

import type { Message } from '@x-mars/ai'
import type {
  TimeBasedMicroConfig,
  TimeBasedMicroResult,
  CachedMicroConfig,
  CachedMicroResult,
} from './types'

const logger = createLogger('@x-mars/memory:micro-compact')

// --- Time-based micro-compact (no LLM) ---

export function timeMicroCompact(
  messages: readonly Message[],
  config: Partial<TimeBasedMicroConfig> = {},
  estimator = defaultEstimateTokens,
): TimeBasedMicroResult {
  const cfg = { ...DEFAULT_TIME_MICRO_CONFIG, ...config }
  const now = Date.now()
  let foldedCount = 0
  let tokensSaved = 0

  const result = messages.map((msg) => {
    if (msg.role !== 'tool_result') {
      return msg
    }

    const age = now - (msg.timestamp ?? now)
    if (age < cfg.ageThresholdMs) {
      return msg
    }

    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')

    if (text.startsWith('[output folded') || text.startsWith('[output pruned')) {
      return msg
    }

    const tokens = estimator(text)
    if (tokens < cfg.minOutputTokens) {
      return msg
    }

    const placeholder = `[output folded — ${tokens} tokens]`
    foldedCount++
    tokensSaved += tokens - estimator(placeholder)

    return {
      ...msg,
      content: [{ type: 'text' as const, text: placeholder }],
    }
  })

  if (foldedCount > 0) {
    logger.info(`Time micro-compact: folded ${foldedCount} outputs, saved ~${tokensSaved} tokens`)
  }

  return { messages: result, foldedCount, tokensSaved, changed: foldedCount > 0 }
}

// --- Cached micro-compact (lightweight LLM, with hash cache) ---

const MICRO_SUMMARY_PROMPT = `Summarize the following conversation excerpt in 2-3 concise paragraphs. Focus on:
- Key decisions and actions taken
- File paths referenced or modified
- Important findings or results
- Unresolved questions or next steps

Be factual and specific. Preserve technical details like file paths, function names, and error messages.

Conversation excerpt:
`

function hashContent(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

export class MicroCompactCache {
  private readonly cache = new Map<string, string>()
  private readonly maxEntries: number

  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
      }
    }
    this.cache.set(key, value)
  }

  get size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
  }
}

export async function cachedMicroCompact(
  messages: readonly Message[],
  contextWindow: number,
  summarize: (
    prompt: string,
    options?: { maxTokens?: number; signal?: AbortSignal },
  ) => Promise<string>,
  cache: MicroCompactCache,
  config: Partial<CachedMicroConfig> = {},
  estimator = defaultEstimateTokens,
  signal?: AbortSignal,
): Promise<CachedMicroResult> {
  const cfg = { ...DEFAULT_CACHED_MICRO_CONFIG, ...config }

  const triggerTokens = resolveContextSize(cfg.trigger, contextWindow)
  const currentTokens = estimateMessagesTokens(messages, estimator)

  if (currentTokens < triggerTokens) {
    return { messages: [...messages], cached: false, changed: false }
  }

  const windowSize = Math.max(2, Math.floor(messages.length * cfg.windowFraction))
  const windowMessages = messages.slice(0, windowSize)
  const preservedMessages = messages.slice(windowSize)

  if (windowMessages.length < 2) {
    return { messages: [...messages], cached: false, changed: false }
  }

  const windowText = windowMessages.map((m) => messageToText(m)).join('\n---\n')
  const contentHash = hashContent(windowText)

  let summary = cache.get(contentHash)
  const wasCached = summary !== undefined

  if (!summary) {
    logger.info(`Cached micro-compact: summarizing ${windowSize} messages (cache miss)`)
    summary = await summarize(MICRO_SUMMARY_PROMPT + windowText, {
      maxTokens: cfg.reserveTokens,
      signal,
    })
    cache.set(contentHash, summary)
  } else {
    logger.info(`Cached micro-compact: using cached summary (${contentHash})`)
  }

  const summaryMessage: Message = {
    role: 'user',
    content: [{ type: 'text', text: `[Micro Summary]\n\n${summary}` }],
    timestamp: Date.now(),
  }

  return {
    messages: [summaryMessage, ...preservedMessages],
    summary,
    cached: wasCached,
    changed: true,
  }
}
