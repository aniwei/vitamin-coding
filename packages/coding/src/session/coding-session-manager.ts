import {
  InMemorySession,
  InMemorySessionPersistence,
  FileSessionPersistence,
  RemoteSessionPersistence,
} from '@vitamin/session'
import {
  SESSION_MAX,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_SNAPSHOT_VERSION,
} from '@vitamin/env'
import { createAgentWithRegistry, type AgentMessage } from '@vitamin/agent'
import { type ProviderRegistry } from '@vitamin/ai'
import { type HookRegistry } from '@vitamin/hooks'
import { type Logger } from '@vitamin/shared'

import { AgentSession } from './agent-session'

import type { Session, SessionPersistence } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'
import type { AgentSessionInfo, ResolvedSessionConfig } from './types'

/**
 * Manager 只持有基础设施配置（持久化、网络、日志）。
 * 业务配置（model、systemPrompt、tools 等）由 VitaminApp 解析后通过
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
}

export class CodingSessionManager {
  // 单一数据源：sessions Map 就是所有在线 session 的权威状态
  private readonly sessions = new Map<string, AgentSession>()
  // 记录每个 session 的配置，供 forkSession 复用
  private readonly configs = new Map<string, ResolvedSessionConfig>()

  // 持久化层（统一接口，内存 / 磁盘 / 远端三种实现）
  private readonly persistence: SessionPersistence<AgentMessage>

  // Capacity 管理
  private readonly maxSessions: number
  private readonly idleTimeoutMs: number
  private readonly threshold: number

  // 活跃 session 跟踪
  private activeSessionId?: string

  // 跨切面依赖
  private readonly providerRegistry: ProviderRegistry
  private readonly hookRegistry: HookRegistry
  private readonly logger: Logger
  private readonly devtools?: Devtools

  // restore / restoreAll 路径使用的配置工厂（非静态快照）
  private readonly configProvider?: () => ResolvedSessionConfig

  constructor(
    options: CodingSessionManagerOptions,
    persistence: SessionPersistence<AgentMessage>,
  ) {
    this.providerRegistry = options.providerRegistry
    this.hookRegistry = options.hookRegistry
    this.logger = options.logger
    this.devtools = options.devtools
    this.configProvider = options.configProvider
    this.persistence = persistence

    const resolvedMax = options.maxSessions ?? SESSION_MAX
    this.maxSessions = resolvedMax
    this.idleTimeoutMs = options.idleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS
    this.threshold = Math.max(
      0,
      Math.min(options.threshold ?? resolvedMax, resolvedMax),
    )
  }

  get active(): AgentSession | undefined {
    return this.activeSessionId
      ? this.sessions.get(this.activeSessionId)
      : undefined
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
    const agent = createAgentWithRegistry({
      model: config.model,
      providerRegistry: this.providerRegistry,
    })

    return new AgentSession(rawSession, agent, {
      model: config.model,
      agentName: config.agentName,
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      thinkingLevel: config.thinkingLevel,
      maxToolTurns: config.maxToolTurns,
      promptRefresh: config.promptRefresh,
      workspaceDir: config.workspaceDir,
      hookRegistry: this.hookRegistry,
      providerRegistry: this.providerRegistry,
      logger: this.logger.child({ sessionId: rawSession.id }),
      devtools: this.devtools,
    })
  }

  /**
   * 使用由 VitaminApp 完整解析好的配置创建 session。
   * Manager 层不再进行任何业务默认值填充。
   */
  async createSession(
    config: ResolvedSessionConfig & { id?: string },
  ): Promise<AgentSession> {
    const id = config.id ?? crypto.randomUUID()

    if (this.sessions.has(id)) {
      throw new Error(`Session with ID ${id} already exists.`)
    }

    this.prepareCapacity(id)

    const rawSession = new InMemorySession<AgentMessage>(id)
    const agentSession = this.buildAgentSession(rawSession, config)

    this.sessions.set(id, agentSession)
    this.configs.set(id, config)
    this.activeSessionId = id

    await this.hookRegistry.emit('session.created', {
      sessionId: id,
      metadata: {},
    })
    this.logger.info('Session %s created', id)

    return agentSession
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
    if (!agentSession) return false

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
    this.logger.info('Session %s removed', id)

    return true
  }

  /**
   * fork 直接复用 source session 自身的已解析配置，
   * 消息通过复制 snapshot entries 完整迁移。
   */
  async forkSession(
    sourceId: string,
    newId?: string,
  ): Promise<AgentSession | undefined> {
    const sourceSession = this.sessions.get(sourceId)
    const sourceConfig = this.configs.get(sourceId)
    if (!sourceSession || !sourceConfig) return undefined

    const sourceRaw = sourceSession.session
    if (!(sourceRaw instanceof InMemorySession)) return undefined

    const id = newId ?? crypto.randomUUID()
    this.prepareCapacity(id)

    const snapshot = sourceRaw.toSnapshot()
    const forkedRaw = new InMemorySession<AgentMessage>(
      id,
      sourceId,
      snapshot.entries.length,
    )
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
    )

    const forkedConfig: ResolvedSessionConfig = {
      model: sourceSession.model,
      agentName:
        sourceSession.agentName !== 'agent'
          ? sourceSession.agentName
          : undefined,
      systemPrompt: sourceSession.systemPrompt,
      tools: sourceSession.tools,
      thinkingLevel: sourceSession.thinkingLevel,
      maxToolTurns: sourceSession.maxToolTurns,
      promptRefresh: sourceSession.promptRefresh,
      workspaceDir: sourceSession.workspaceDir,
    }

    const agentSession = this.buildAgentSession(forkedRaw, forkedConfig)
    this.sessions.set(id, agentSession)
    this.configs.set(id, forkedConfig)

    this.logger.info('Session %s forked from %s', id, sourceId)
    return agentSession
  }

  async save(id: string): Promise<void> {
    const agentSession = this.sessions.get(id)
    if (!agentSession) return

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

  /**
   * 从持久化存储恢复单个 session。
   * 若未提供 configProvider 则返回 null。
   */
  async restore(id: string): Promise<AgentSession | null> {
    if (!this.configProvider) return null

    const existing = this.sessions.get(id)
    if (existing) return existing

    const snapshot = await this.persistence.load(id)
    if (!snapshot) return null

    if (!this.canAccommodate(id)) {
      throw new Error(
        `Max sessions (${this.maxSessions}) reached, cannot restore ${id}.`,
      )
    }

    const rawSession = new InMemorySession<AgentMessage>(snapshot.id)
    rawSession.restoreEntries(
      snapshot.entries,
      snapshot.metadata,
      snapshot.leafId,
    )

    const config = this.configProvider()
    const agentSession = this.buildAgentSession(rawSession, config)
    this.sessions.set(id, agentSession)
    this.configs.set(id, config)

    this.logger.info('Session %s restored', id)
    return agentSession
  }

  /**
   * 从持久化存储批量恢复所有 session。
   * 若未提供 configProvider 则直接返回 0。
   */
  async restoreAll(): Promise<number> {
    if (!this.configProvider) return 0

    const ids = await this.persistence.list()
    let restored = 0

    for (const id of ids) {
      if (this.sessions.has(id)) continue

      const snapshot = await this.persistence.load(id)
      if (!snapshot) continue

      if (!this.canAccommodate(id)) break

      const rawSession = new InMemorySession<AgentMessage>(snapshot.id)
      rawSession.restoreEntries(
        snapshot.entries,
        snapshot.metadata,
        snapshot.leafId,
      )

      const config = this.configProvider()
      const agentSession = this.buildAgentSession(rawSession, config)
      this.sessions.set(id, agentSession)
      this.configs.set(id, config)
      restored++
    }

    this.logger.info('Restored %d session(s)', restored)
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
    if (this.sessions.has(incomingId)) return

    if (this.sessions.size + 1 > this.threshold) {
      this.collectIdle()
    }

    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Max sessions (${this.maxSessions}) reached.`)
    }
  }

  private canAccommodate(incomingId: string): boolean {
    if (this.sessions.has(incomingId)) return true

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
    fetch() {
      throw new Error(
        'Fetch implementation is required for RemoteSessionPersistence',
      )
    },
    getAuth: async () => ({ token: '' }),
    timeoutMs: 30_000,
  })

  return new CodingSessionManager(options, persistence)
}

export function createInMemoryCodingSessionManager(
  options: CodingSessionManagerOptions,
): CodingSessionManager {
  return new CodingSessionManager(options, new InMemorySessionPersistence())
}
