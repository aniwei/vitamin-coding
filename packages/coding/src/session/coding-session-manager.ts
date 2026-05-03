import {
  InMemorySession,
  InMemorySessionPersistence,
  FileSessionPersistence,
  RemoteSessionPersistence,
} from '@x-mars/session'
import { SESSION_MAX, SESSION_IDLE_TIMEOUT_MS, SESSION_SNAPSHOT_VERSION } from '@x-mars/env'
import { stream as aiStream, type ProviderRegistry } from '@x-mars/ai'
import type { AgentMessage, StreamFunction } from '@x-mars/agent'
import { type HookRegistry } from '@x-mars/hooks'
import { type Logger } from '@x-mars/shared'
import type { SessionSearchMatch, SessionSearchResult } from '@x-mars/tools'

import { AgentSession } from './agent-session'

import type { Session, SessionPersistence, SessionSnapshot } from '@x-mars/session'
import type { Devtools } from '@x-mars/devtools'
import type { AgentSessionInfo, ResolvedSessionConfig } from './types'

/**
 * Manager 只持有基础设施配置（持久化、网络、日志）。
 * 业务配置（model、systemPrompt、tools 等）由 XMarsApp 解析后通过
 * ResolvedSessionConfig 传入 createSession，Manager 不做二次 merge。
 */
export interface CodingSessionManagerOptions {
  hookRegistry: HookRegistry
  providerRegistry: ProviderRegistry
  maxSessions?: number
  idleTimeoutMs?: number
  threshold?: number
  logger: Logger
  devtools?: Devtools
  model?: ResolvedSessionConfig['model']
  agentName?: ResolvedSessionConfig['agentName']
  systemPrompt?: ResolvedSessionConfig['systemPrompt']
  tools?: ResolvedSessionConfig['tools']
  thinkingLevel?: ResolvedSessionConfig['thinkingLevel']
  maxToolTurns?: ResolvedSessionConfig['maxToolTurns']
  promptRefresh?: ResolvedSessionConfig['promptRefresh']
  workspaceDir?: ResolvedSessionConfig['workspaceDir']
  permissionMetadata?: ResolvedSessionConfig['permissionMetadata']
  /**
   * 仅用于 restore / restoreAll 场景。
   * 正常 createSession 路径必须传入完整 ResolvedSessionConfig，不使用此字段。
   * 使用 factory function 而非静态快照，确保每次 restore 拿到最新配置。
   */
  configProvider?: () => ResolvedSessionConfig
}

export interface DiskSessionManagerOptions extends CodingSessionManagerOptions {
  sessionDir: string
}

export interface RemoteSessionManagerOptions extends CodingSessionManagerOptions {
  sessionUrl: string
  /** fetch 实现（必填）。在浏览器环境可传 globalThis.fetch，Node.js 需传兼容实现。 */
  fetch: typeof globalThis.fetch
  /** 返回认证 token 的工厂函数（必填）。 */
  getAuth: () => Promise<{ token: string }>
  timeoutMs?: number
}

// @x-mars/agent 不感知具体 LLM 实现，由此处注入
function makeStream(registry: ProviderRegistry): StreamFunction {
  return (context, signal) => {
    const provider = registry.get(context.model.api)
    return aiStream(context.model, provider, context, { signal })
  }
}

export class CodingSessionManager {
  private readonly sessions = new Map<string, AgentSession>()
  private readonly configs = new Map<string, ResolvedSessionConfig>()

  private readonly persistence: SessionPersistence<AgentMessage>

  private readonly maxSessions: number
  private readonly idleTimeoutMs: number
  private readonly threshold: number

  private activeSessionId?: string

  private readonly stream: StreamFunction
  private readonly hookRegistry: HookRegistry
  private readonly logger: Logger
  private readonly devtools?: Devtools
  private readonly defaultConfig: Partial<ResolvedSessionConfig>

  // 供 restore / restoreAll 路径使用，确保每次拿到最新配置
  private readonly configProvider?: () => ResolvedSessionConfig

  constructor(options: CodingSessionManagerOptions, persistence: SessionPersistence<AgentMessage>) {
    this.stream = makeStream(options.providerRegistry)
    this.hookRegistry = options.hookRegistry
    this.logger = options.logger
    this.devtools = options.devtools
    this.defaultConfig = {
      model: options.model,
      agentName: options.agentName,
      systemPrompt: options.systemPrompt,
      tools: options.tools,
      thinkingLevel: options.thinkingLevel,
      maxToolTurns: options.maxToolTurns,
      promptRefresh: options.promptRefresh,
      workspaceDir: options.workspaceDir,
      permissionMetadata: options.permissionMetadata,
    }
    this.configProvider = options.configProvider
    this.persistence = persistence

    const resolvedMax = options.maxSessions ?? SESSION_MAX
    this.maxSessions = resolvedMax
    this.idleTimeoutMs = options.idleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS
    this.threshold = Math.max(0, Math.min(options.threshold ?? resolvedMax, resolvedMax))
  }

  get active(): AgentSession | undefined {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined
  }

  setActive(id: string): AgentSession | undefined {
    const session = this.sessions.get(id)
    if (session) {
      this.activeSessionId = id
    }
    return session
  }

  private buildAgentSession(
    rawSession: Session<AgentMessage>,
    config: ResolvedSessionConfig,
  ): AgentSession {
    return new AgentSession(rawSession, {
      model: config.model,
      agentName: config.agentName,
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      thinkingLevel: config.thinkingLevel,
      maxToolTurns: config.maxToolTurns,
      promptRefresh: config.promptRefresh,
      workspaceDir: config.workspaceDir,
      permissionMetadata: config.permissionMetadata,
      hookRegistry: this.hookRegistry,
      stream: this.stream,
      logger: this.logger.child({ sessionId: rawSession.id }),
      devtools: this.devtools,
    })
  }

  /**
   * 使用由 XMarsApp 完整解析好的配置创建 session。
   * 若调用方使用旧接口传入局部配置，则与 manager 默认配置合并。
   */
  async createSession(
    config: Partial<ResolvedSessionConfig> & { id?: string } = {},
  ): Promise<AgentSession> {
    const id = config.id ?? crypto.randomUUID()

    if (this.sessions.has(id)) {
      throw new Error(`Session with ID ${id} already exists.`)
    }

    this.prepareCapacity(id)

    const rawSession = new InMemorySession<AgentMessage>(id)
    const resolvedConfig = this.resolveSessionConfig(config)
    const agentSession = this.buildAgentSession(rawSession, resolvedConfig)

    this.sessions.set(id, agentSession)
    this.configs.set(id, resolvedConfig)
    this.activeSessionId = id

    await this.hookRegistry.emit('session.created', {
      sessionId: id,
      metadata: {},
    })

    // session.created hook 执行完毕后，EventBridge 已完成订阅，
    // 此时发布 session_start 事件可被正确接收。
    agentSession.notifyCreated()

    this.logger.info({ sessionId: id }, 'Session created')

    return agentSession
  }

  private resolveSessionConfig(
    config: Partial<ResolvedSessionConfig> & { id?: string },
  ): ResolvedSessionConfig {
    const base = this.configProvider?.() ?? this.defaultConfig
    const model = config.model ?? base.model
    if (!model) {
      throw new Error('No model specified')
    }

    return {
      model,
      agentName: config.agentName ?? base.agentName,
      systemPrompt: config.systemPrompt ?? base.systemPrompt ?? '',
      tools: config.tools ?? base.tools ?? [],
      thinkingLevel: config.thinkingLevel ?? base.thinkingLevel ?? 'medium',
      maxToolTurns: config.maxToolTurns ?? base.maxToolTurns ?? 25,
      promptRefresh: config.promptRefresh ?? base.promptRefresh,
      workspaceDir: config.workspaceDir ?? base.workspaceDir ?? process.cwd(),
      permissionMetadata: config.permissionMetadata ?? base.permissionMetadata,
    }
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id)
  }

  listSessions(): AgentSessionInfo[] {
    return Array.from(this.sessions.values()).map((agentSession) => ({
      id: agentSession.id,
      messageCount: agentSession.session.messages().length,
      createdAt: new Date(),
      status: agentSession.status,
    }))
  }

  async removeSession(id: string): Promise<boolean> {
    const agentSession = this.sessions.get(id)
    if (!agentSession) {
      return false
    }

    agentSession.dispose()
    this.sessions.delete(id)
    this.configs.delete(id)

    if (this.activeSessionId === id) {
      this.activeSessionId = undefined
    }

    await this.persistence.delete(id)

    await this.hookRegistry.emit('session.deleted', {
      sessionId: id,
      metadata: {},
    })
    this.logger.info({ sessionId: id }, 'Session removed')

    return true
  }

  /**
   * fork 直接复用 source session 自身的已解析配置，
   * 消息通过复制 snapshot entries 完整迁移。
   */
  async forkSession(
    sourceId: string,
    newId?: string,
    overrides: Partial<
      Pick<ResolvedSessionConfig, 'agentName' | 'tools' | 'workspaceDir' | 'permissionMetadata'>
    > = {},
  ): Promise<AgentSession | undefined> {
    const sourceSession = this.sessions.get(sourceId)
    const sourceConfig = this.configs.get(sourceId)
    if (!sourceSession || !sourceConfig) {
      return undefined
    }

    const sourceRaw = sourceSession.session
    if (!(sourceRaw instanceof InMemorySession)) {
      return undefined
    }

    const id = newId ?? crypto.randomUUID()
    this.prepareCapacity(id)

    const snapshot = sourceRaw.toSnapshot()
    const forkedRaw = new InMemorySession<AgentMessage>(id, sourceId, snapshot.entries.length)
    forkedRaw.restoreEntries(
      [...snapshot.entries],
      {
        ...snapshot.metadata,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        parentSessionId: sourceId,
        forkPoint: snapshot.entries.length,
        tags: [...snapshot.metadata.tags, 'fork'],
      },
      snapshot.leafId,
      snapshot.checkpoints,
      snapshot.sideEffects,
    )

    const forkedConfig: ResolvedSessionConfig = {
      model: sourceSession.model,
      agentName:
        overrides.agentName ??
        (sourceSession.agentName !== 'agent' ? sourceSession.agentName : undefined),
      systemPrompt: sourceSession.systemPrompt,
      tools: overrides.tools ?? sourceSession.tools,
      thinkingLevel: sourceSession.thinkingLevel,
      maxToolTurns: sourceSession.maxToolTurns,
      promptRefresh: sourceSession.promptRefresh,
      workspaceDir: overrides.workspaceDir ?? sourceSession.workspaceDir,
      permissionMetadata: overrides.permissionMetadata ?? sourceConfig.permissionMetadata,
    }

    const agentSession = this.buildAgentSession(forkedRaw, forkedConfig)
    this.sessions.set(id, agentSession)
    this.configs.set(id, forkedConfig)

    this.logger.info({ sessionId: id, sourceId }, 'Session forked')
    return agentSession
  }

  async save(id: string): Promise<void> {
    const agentSession = this.sessions.get(id)
    if (!agentSession) {
      return
    }

    const rawSession = agentSession.session
    if (rawSession instanceof InMemorySession) {
      const snapshot = rawSession.toSnapshot()
      await this.persistence.save({
        version: SESSION_SNAPSHOT_VERSION,
        id: rawSession.id,
        ...snapshot,
      })
    }
  }

  async saveAll(): Promise<void> {
    for (const id of this.sessions.keys()) {
      await this.save(id)
    }
  }

  async searchSessions(input: { query: string; limit?: number }): Promise<SessionSearchResult[]> {
    const query = input.query.trim()
    if (!query) {
      return []
    }

    const limit = Math.max(1, Math.min(input.limit ?? 5, 20))
    const terms = tokenizeSearchQuery(query)
    const snapshots = new Map<string, SessionSnapshot<AgentMessage>>()

    for (const [id, agentSession] of this.sessions) {
      const rawSession = agentSession.session
      if (rawSession instanceof InMemorySession) {
        snapshots.set(id, {
          version: SESSION_SNAPSHOT_VERSION,
          id,
          ...rawSession.toSnapshot(),
        })
      }
    }

    for (const id of await this.persistence.list()) {
      if (snapshots.has(id)) {
        continue
      }

      const snapshot = await this.persistence.load(id)
      if (snapshot) {
        snapshots.set(id, snapshot)
      }
    }

    return [...snapshots.values()]
      .map((snapshot) => scoreSessionSnapshot(snapshot, query, terms))
      .filter((result): result is SessionSearchResult => result !== null)
      .sort((a, b) => b.score - a.score || b.lastActiveAt - a.lastActiveAt)
      .slice(0, limit)
  }

  /**
   * 从持久化存储恢复单个 session。
   * 若未提供 configProvider 则返回 null。
   */
  async restore(id: string): Promise<AgentSession | null> {
    if (!this.configProvider) {
      return null
    }

    const existing = this.sessions.get(id)
    if (existing) {
      return existing
    }

    const snapshot = await this.persistence.load(id)
    if (!snapshot) {
      return null
    }

    if (!this.canAccommodate(id)) {
      throw new Error(`Max sessions (${this.maxSessions}) reached, cannot restore ${id}.`)
    }

    const rawSession = new InMemorySession<AgentMessage>(snapshot.id)
    rawSession.restoreEntries(
      snapshot.entries,
      snapshot.metadata,
      snapshot.leafId,
      snapshot.checkpoints,
      snapshot.sideEffects,
    )

    const config = this.configProvider()
    const agentSession = this.buildAgentSession(rawSession, config)
    this.sessions.set(id, agentSession)
    this.configs.set(id, config)

    this.logger.info({ sessionId: id }, 'Session restored')
    return agentSession
  }

  /**
   * 从持久化存储批量恢复所有 session。
   * 若未提供 configProvider 则直接返回 0。
   */
  async restoreAll(): Promise<number> {
    if (!this.configProvider) {
      return 0
    }

    const ids = await this.persistence.list()
    let restored = 0

    for (const id of ids) {
      if (this.sessions.has(id)) {
        continue
      }

      const snapshot = await this.persistence.load(id)
      if (!snapshot) {
        continue
      }

      if (!this.canAccommodate(id)) {
        break
      }

      const rawSession = new InMemorySession<AgentMessage>(snapshot.id)
      rawSession.restoreEntries(
        snapshot.entries,
        snapshot.metadata,
        snapshot.leafId,
        snapshot.checkpoints,
        snapshot.sideEffects,
      )

      const config = this.configProvider()
      const agentSession = this.buildAgentSession(rawSession, config)
      this.sessions.set(id, agentSession)
      this.configs.set(id, config)
      restored++
    }

    this.logger.info({ count: restored }, 'Sessions restored')
    return restored
  }

  // ── Capacity management ────────────────────────────────────────────────────

  private collectIdle(): string[] {
    const now = Date.now()
    const removed: string[] = []

    for (const [id, agentSession] of this.sessions) {
      const meta = agentSession.session.metadata()
      if (now - meta.lastActiveAt > this.idleTimeoutMs) {
        agentSession.dispose()
        this.sessions.delete(id)
        this.configs.delete(id)

        if (this.activeSessionId === id) {
          this.activeSessionId = undefined
        }

        removed.push(id)
      }
    }

    return removed
  }

  private prepareCapacity(incomingId: string): void {
    if (this.sessions.has(incomingId)) {
      return
    }

    if (this.sessions.size + 1 > this.threshold) {
      this.collectIdle()
    }

    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Max sessions (${this.maxSessions}) reached.`)
    }
  }

  private canAccommodate(incomingId: string): boolean {
    if (this.sessions.has(incomingId)) {
      return true
    }

    if (this.sessions.size + 1 > this.threshold) {
      this.collectIdle()
    }

    return this.sessions.size < this.maxSessions
  }

  dispose(): void {
    for (const agentSession of this.sessions.values()) {
      agentSession.dispose()
    }
    this.sessions.clear()
    this.configs.clear()
    this.activeSessionId = undefined
  }
}

function tokenizeSearchQuery(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_./:-]+/i)
    .map((term) => term.trim())
    .filter(Boolean)

  return terms.length > 0 ? [...new Set(terms)] : [query.toLowerCase()]
}

function scoreSessionSnapshot(
  snapshot: SessionSnapshot<AgentMessage>,
  query: string,
  terms: string[],
): SessionSearchResult | null {
  const messages = snapshot.entries
    .filter((entry) => entry.type === 'message')
    .map((entry) => ({
      timestamp: entry.timestamp,
      ...agentMessageToSearchText(entry.message),
    }))
    .filter((message) => message.text.length > 0)
  const summaryEntries = snapshot.entries
    .filter((entry) => entry.type === 'compaction')
    .map((entry) => entry.summary)
  const title = snapshot.metadata.title
  const haystack = [title, ...summaryEntries, ...messages.map((message) => message.text)]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLowerCase()

  let score = haystack.includes(query.toLowerCase()) ? 20 : 0
  for (const term of terms) {
    score += countOccurrences(haystack, term)
  }

  if (score <= 0) {
    return null
  }

  const matches: SessionSearchMatch[] = messages
    .filter((message) => textMatchesTerms(message.text, terms, query))
    .slice(0, 5)
    .map((message) => ({
      role: message.role,
      text: truncateSearchText(message.text, 240),
      timestamp: message.timestamp,
    }))

  const summary =
    summaryEntries.at(-1) ??
    matches[0]?.text ??
    (title ? `Session titled "${title}" matched query.` : 'Session matched query.')

  return {
    id: snapshot.id,
    title,
    messageCount: snapshot.metadata.messageCount,
    lastActiveAt: snapshot.metadata.lastActiveAt,
    score,
    summary: truncateSearchText(summary, 280),
    matches,
  }
}

function agentMessageToSearchText(message: AgentMessage): { role?: string; text: string } {
  if (typeof message !== 'object' || message === null) {
    return { text: String(message) }
  }

  const record = message as unknown as Record<string, unknown>
  const role = typeof record.role === 'string' ? record.role : undefined
  const content = record.content

  if (typeof content === 'string') {
    return { role, text: content }
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (typeof part === 'object' && part !== null && 'text' in part) {
          const value = (part as { text?: unknown }).text
          return typeof value === 'string' ? value : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
    return { role, text }
  }

  return { role, text: '' }
}

function countOccurrences(text: string, term: string): number {
  if (!term) {
    return 0
  }

  let count = 0
  let index = text.indexOf(term)
  while (index !== -1) {
    count++
    index = text.indexOf(term, index + term.length)
  }
  return count
}

function textMatchesTerms(text: string, terms: string[], query: string): boolean {
  const normalized = text.toLowerCase()
  return normalized.includes(query.toLowerCase()) || terms.some((term) => normalized.includes(term))
}

function truncateSearchText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}…`
}

export function createDiskCodingSessionManager(
  options: DiskSessionManagerOptions,
): CodingSessionManager {
  const { sessionDir } = options
  if (!sessionDir) {
    throw new Error('sessionDir is required for DiskSessionManager')
  }

  const persistence = new FileSessionPersistence<AgentMessage>({
    baseDir: sessionDir,
  })
  return new CodingSessionManager(options, persistence)
}

export function createRemoteCodingSessionManager(
  options: RemoteSessionManagerOptions,
): CodingSessionManager {
  const { sessionUrl } = options
  if (!sessionUrl) {
    throw new Error('sessionUrl is required for RemoteSessionManager')
  }

  const persistence = new RemoteSessionPersistence<AgentMessage>({
    baseUrl: sessionUrl,
    fetch: options.fetch,
    getAuth: options.getAuth,
    timeoutMs: options.timeoutMs ?? 30_000,
  })

  return new CodingSessionManager(options, persistence)
}

export function createInMemoryCodingSessionManager(
  options: CodingSessionManagerOptions,
): CodingSessionManager {
  return new CodingSessionManager(options, new InMemorySessionPersistence())
}
