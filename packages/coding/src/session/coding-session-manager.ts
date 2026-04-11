import {
  SessionManager,
  createDiskSessionManager,
  createInMemorySessionManager,
  createRemoteSessionManager,
} from '@vitamin/session'
import {
  createAgentWithRegistry,
  type AgentMessage,
} from '@vitamin/agent'
import {
  type ProviderRegistry,
} from '@vitamin/ai'
import {
  type HookRegistry
} from '@vitamin/hooks'
import {
  type Logger
} from '@vitamin/shared'

import { AgentSession } from './agent-session'

import type { Session } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'
import type {
  AgentSessionInfo,
  ResolvedSessionConfig,
} from './types'
import type { SessionManagerOptions } from '@vitamin/session'

/**
 * Manager 只持有基础设施配置（持久化、网络、日志）。
 * 业务配置（model、systemPrompt、tools 等）由 VitaminApp 解析后通过
 * ResolvedSessionConfig 传入 createSession，Manager 不做二次 merge。
 */
export interface CodingSessionManagerOptions extends Omit<SessionManagerOptions<AgentMessage>, 'store'> {
  hookRegistry: HookRegistry
  providerRegistry: ProviderRegistry
  workspaceDir: string
  maxSessions?: number
  idleTimeoutMs?: number
  threshold?: number
  logger: Logger
  devtools?: Devtools
  /**
   * 仅用于 restore / restoreAll 场景。
   * 正常 createSession 路径必须传入完整 ResolvedSessionConfig，不使用此字段。
   */
  defaultSessionConfig?: ResolvedSessionConfig
}

export interface DiskSessionManagerOptions extends CodingSessionManagerOptions {
  sessionDir: string
}

export interface RemoteSessionManagerOptions extends CodingSessionManagerOptions {
  sessionUrl: string
}

export class CodingSessionManager {
  private readonly sessionManager: SessionManager<AgentMessage>
  private readonly agentSessions = new Map<string, AgentSession>()

  private readonly providerRegistry: ProviderRegistry
  private readonly hookRegistry: HookRegistry
  private readonly workspaceDir: string
  private readonly logger: Logger
  private readonly devtools?: Devtools
  private readonly defaultSessionConfig?: ResolvedSessionConfig

  constructor(
    sessionManager: SessionManager<AgentMessage>,
    options: CodingSessionManagerOptions,
  ) {
    this.sessionManager = sessionManager
    this.providerRegistry = options.providerRegistry
    this.hookRegistry = options.hookRegistry
    this.workspaceDir = options.workspaceDir
    this.logger = options.logger
    this.devtools = options.devtools
    this.defaultSessionConfig = options.defaultSessionConfig
  }

  get active(): AgentSession | undefined {
    this.updateAgentSessionsWithStore()

    const rawActive = this.sessionManager.active
    if (!rawActive) return undefined

    return this.agentSessions.get(rawActive.id)
  }

  private updateAgentSessionsWithStore(): void {
    const liveSessions = new Map(this.sessionManager.list().map((session) => [session.id, session]))

    for (const [id, agentSession] of this.agentSessions) {
      const liveSession = liveSessions.get(id)
      if (!liveSession || liveSession !== agentSession.session) {
        agentSession.dispose()
        this.agentSessions.delete(id)
      }
    }
  }

  /**
   * 从已解析的配置创建 AgentSession，不做任何 merge 或默认值填充。
   * logger 由 Manager 统一创建（带 sessionId child）。
   */
  private createManagedAgentSession(
    session: Session<AgentMessage>,
    config: ResolvedSessionConfig,
  ): AgentSession {
    const agent = createAgentWithRegistry({
      model: config.model,
      providerRegistry: this.providerRegistry,
    })

    return new AgentSession(session, agent, {
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
      logger: this.logger.child({ sessionId: session.id }),
      devtools: this.devtools,
    })
  }

  /**
   * 使用由 VitaminApp 完整解析好的配置创建 session。
   * Manager 层不再进行任何业务默认值填充。
   */
  async createSession(config: ResolvedSessionConfig & { id?: string }): Promise<AgentSession> {
    const id = config.id ?? crypto.randomUUID()

    if (this.agentSessions.has(id)) {
      throw new Error(`Session with ID ${id} already exists.`)
    }

    const session = await this.sessionManager.create(id)
    this.updateAgentSessionsWithStore()

    const agentSession = this.createManagedAgentSession(session, config)
    this.agentSessions.set(session.id, agentSession)

    await this.hookRegistry.emit('session.created', { sessionId: session.id, metadata: {} })
    this.logger.info('Session %s created', session.id)

    return agentSession
  }

  getSession(id: string): AgentSession | undefined {
    this.updateAgentSessionsWithStore()
    return this.agentSessions.get(id)
  }

  listSessions(): AgentSessionInfo[] {
    this.updateAgentSessionsWithStore()

    const result: AgentSessionInfo[] = []
    for (const [id, agentSession] of this.agentSessions) {
      result.push({
        id,
        messageCount: agentSession.session.messages().length,
        createdAt: new Date(),
        status: agentSession.status,
      })
    }
    return result
  }

  async removeSession(id: string): Promise<boolean> {
    const agentSession = this.agentSessions.get(id)
    if (!agentSession) return false

    agentSession.dispose()
    this.agentSessions.delete(id)

    await this.sessionManager.delete(id)
    await this.hookRegistry.emit('session.deleted', { sessionId: id, metadata: {} })

    this.logger.info('Session %s removed', id)

    return true
  }

  /**
   * fork 直接复用 source session 自身的已解析配置，
   * 而不是退回到 Manager 层的任何默认值。
   */
  async forkSession(
    sourceId: string,
    id?: string,
  ): Promise<AgentSession | undefined> {
    const source = this.agentSessions.get(sourceId)
    if (!source) return undefined

    const forked = await this.sessionManager.fork(sourceId, id)
    if (!forked) return undefined

    const agentSession = this.createManagedAgentSession(forked, {
      model: source.model,
      agentName: source.agentName !== 'agent' ? source.agentName : undefined,
      systemPrompt: source.systemPrompt,
      tools: source.tools,
      thinkingLevel: source.thinkingLevel,
      maxToolTurns: source.maxToolTurns,
      promptRefresh: source.promptRefresh,
      workspaceDir: source.workspaceDir,
    })

    this.agentSessions.set(forked.id, agentSession)
    this.logger.info('Session %s forked from %s', forked.id, sourceId)

    return agentSession
  }

  setActive(id: string): AgentSession | undefined {
    this.updateAgentSessionsWithStore()
    this.sessionManager.setActive(id)
    return this.agentSessions.get(id)
  }

  async save(id: string): Promise<void> {
    await this.sessionManager.save(id)
  }

  /**
   * 从持久化存储恢复单个 session。
   * 若未提供 defaultSessionConfig 则返回 null。
   */
  async restore(id: string): Promise<AgentSession | null> {
    const session = await this.sessionManager.restore(id)
    if (!session) return null

    this.updateAgentSessionsWithStore()

    // 已经存在的 AgentSession 直接返回
    if (this.agentSessions.has(session.id)) {
      return this.agentSessions.get(session.id)!
    }

    if (!this.defaultSessionConfig) return null

    const agentSession = this.createManagedAgentSession(session, this.defaultSessionConfig)
    this.agentSessions.set(session.id, agentSession)
    this.logger.info('Session %s restored', session.id)

    return agentSession
  }

  async saveAll(): Promise<void> {
    await this.sessionManager.saveAll()
  }

  /**
   * 从持久化存储批量恢复所有 session。
   * 若未提供 defaultSessionConfig 则直接返回 0。
   */
  async restoreAll(): Promise<number> {
    if (!this.defaultSessionConfig) return 0

    const count = await this.sessionManager.restoreAll()
    this.updateAgentSessionsWithStore()

    for (const rawSession of this.sessionManager.list()) {
      if (!this.agentSessions.has(rawSession.id)) {
        const agentSession = this.createManagedAgentSession(rawSession, this.defaultSessionConfig)
        this.agentSessions.set(rawSession.id, agentSession)
      }
    }
    return count
  }

  dispose(): void {
    for (const [, agentSession] of this.agentSessions) {
      agentSession.dispose()
    }

    this.agentSessions.clear()
    this.sessionManager.dispose()
  }
}

export function createDiskCodingSessionManager(options: DiskSessionManagerOptions): CodingSessionManager {
  const { sessionDir } = options
  if (!sessionDir) {
    throw new Error('sessionDir is required for DiskSessionManager')
  }

  const { maxSessions, idleTimeoutMs, threshold } = options
  const sm = createDiskSessionManager<AgentMessage>(sessionDir, {
    maxSessions,
    idleTimeoutMs,
    threshold,
  })

  return new CodingSessionManager(sm, options)
}

export function createRemoteCodingSessionManager(options: RemoteSessionManagerOptions): CodingSessionManager {
  const { sessionUrl } = options
  if (!sessionUrl) {
    throw new Error('sessionUrl is required for RemoteSessionManager')
  }

  const { maxSessions, idleTimeoutMs, threshold } = options
  const sm = createRemoteSessionManager<AgentMessage>(sessionUrl, {
    maxSessions,
    idleTimeoutMs,
    threshold,
  })

  return new CodingSessionManager(sm, options)
}

export function createInMemoryCodingSessionManager(
  options: CodingSessionManagerOptions,
): CodingSessionManager {
  const { maxSessions, idleTimeoutMs, threshold } = options
  const sm = createInMemorySessionManager<AgentMessage>({
    maxSessions,
    idleTimeoutMs,
    threshold,
  })

  return new CodingSessionManager(sm, options)
}
