// Prompt Cache Scope — manages shared cache prefix across related API calls
// Enables fork agents to reuse the parent conversation's cache prefix

import { createLogger } from '@x-mars/shared'
import type { Message } from './types'

const logger = createLogger('@x-mars/ai:cache-scope')

export type CacheRetention = 'none' | 'short' | 'long'

export interface CacheScopeEntry {
  scopeId: string
  expiresAt: number
  messageFingerprints: string[] // hash chain for cache-break detection
  lastBreakIndex: number | null
}

export interface CacheStats {
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalInputTokens: number
  hitRate: number
  turnsCached: number
  totalTurns: number
}

// 5 min for ephemeral (default Anthropic cache TTL), 1 hour for long-lived
const EPHEMERAL_TTL_MS = 5 * 60 * 1000
const LONG_TTL_MS = 60 * 60 * 1000

function ttlForRetention(retention: CacheRetention): number {
  return retention === 'long' ? LONG_TTL_MS : EPHEMERAL_TTL_MS
}

function fingerprintMessage(msg: Message): string {
  // Fast hash of role + content structure (not full content)
  const role = msg.role
  const contentLen =
    typeof msg.content === 'string'
      ? msg.content.length
      : msg.content.reduce((sum, part) => sum + (part.type === 'text' ? part.text.length : 0), 0)
  return `${role}:${contentLen}`
}

/**
 * Global cache scope registry. Allows fork agents to look up a parent
 * conversation's cache prefix and avoid recomputing the expensive system
 * prompt + tool schema cache.
 */
class PromptCacheScopeRegistry {
  private scopes = new Map<string, CacheScopeEntry>()
  private stats = new Map<string, CacheStats>()

  /** Register or refresh a cache scope */
  register(scopeId: string, messages: readonly Message[], retention: CacheRetention): void {
    const now = Date.now()
    const ttl = ttlForRetention(retention)

    this.scopes.set(scopeId, {
      scopeId,
      expiresAt: now + ttl,
      messageFingerprints: messages.map(fingerprintMessage),
      lastBreakIndex: null,
    })

    // Initialize stats
    if (!this.stats.has(scopeId)) {
      this.stats.set(scopeId, {
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalInputTokens: 0,
        hitRate: 0,
        turnsCached: 0,
        totalTurns: 0,
      })
    }

    logger.debug('Cache scope "%s" registered, expires in %dms', scopeId, ttl)
  }

  /** Look up an active cache scope */
  get(scopeId: string): CacheScopeEntry | undefined {
    const entry = this.scopes.get(scopeId)
    if (!entry) {
      return undefined
    }

    // Check expiry
    if (Date.now() >= entry.expiresAt) {
      this.scopes.delete(scopeId)
      logger.debug('Cache scope "%s" expired', scopeId)
      return undefined
    }

    return entry
  }

  /** Refresh the TTL on an existing scope */
  refresh(scopeId: string, retention: CacheRetention): boolean {
    const entry = this.scopes.get(scopeId)
    if (!entry) {
      return false
    }

    entry.expiresAt = Date.now() + ttlForRetention(retention)
    return true
  }

  /**
   * Compute the shared prefix between parent and child messages.
   * Returns the index in child messages where they diverge from parent.
   * Messages before this index share the parent's cache prefix.
   */
  computeSharedPrefixLength(
    parentMessages: readonly Message[],
    childMessages: readonly Message[],
  ): number {
    const minLen = Math.min(parentMessages.length, childMessages.length)
    let shared = 0

    for (let i = 0; i < minLen; i++) {
      const parentMessage = parentMessages[i]
      const childMessage = childMessages[i]
      if (!parentMessage || !childMessage) {
        break
      }
      if (fingerprintMessage(parentMessage) === fingerprintMessage(childMessage)) {
        shared++
      } else {
        break
      }
    }

    return shared
  }

  /** Record cache usage and detect breaks */
  recordUsage(
    scopeId: string,
    cacheReadTokens: number,
    cacheWriteTokens: number,
    inputTokens: number,
  ): { wasBreak: boolean; previousHitRate: number } {
    const stats = this.stats.get(scopeId)
    if (!stats) {
      return { wasBreak: false, previousHitRate: 0 }
    }

    const previousHitRate = stats.hitRate

    stats.totalTurns++
    stats.totalCacheReadTokens += cacheReadTokens
    stats.totalCacheWriteTokens += cacheWriteTokens
    stats.totalInputTokens += inputTokens

    if (cacheReadTokens > 0) {
      stats.turnsCached++
    }

    stats.hitRate =
      stats.totalInputTokens > 0 ? stats.totalCacheReadTokens / stats.totalInputTokens : 0

    const wasBreak = stats.totalTurns > 1 && cacheReadTokens === 0

    if (wasBreak) {
      const entry = this.scopes.get(scopeId)
      logger.warn(
        { scopeId, hitRate: stats.hitRate.toFixed(2), previousHitRate: previousHitRate.toFixed(2) },
        'Cache break detected for scope',
      )
      if (entry) {
        entry.lastBreakIndex = stats.totalTurns - 1
      }
    }

    return { wasBreak, previousHitRate }
  }

  /** Get cache statistics for a scope */
  getStats(scopeId: string): Readonly<CacheStats> | undefined {
    return this.stats.get(scopeId)
  }

  /** Remove a scope and its stats */
  remove(scopeId: string): void {
    this.scopes.delete(scopeId)
    this.stats.delete(scopeId)
  }

  /** Remove all expired scopes */
  cleanup(): number {
    const now = Date.now()
    let removed = 0
    for (const [id, entry] of this.scopes) {
      if (now >= entry.expiresAt) {
        this.scopes.delete(id)
        this.stats.delete(id)
        removed++
      }
    }
    return removed
  }

  get size(): number {
    return this.scopes.size
  }
}

// Singleton
let instance: PromptCacheScopeRegistry | null = null

export function getCacheScopeRegistry(): PromptCacheScopeRegistry {
  if (!instance) {
    instance = new PromptCacheScopeRegistry()
  }
  return instance
}

export function createCacheScopeRegistry(): PromptCacheScopeRegistry {
  return new PromptCacheScopeRegistry()
}
