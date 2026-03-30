import { 
  createFileSessionManager, 
  createInMemorySessionManager,
  createRemoteSessionManager, 
  SessionManager 
} from '@vitamin/session'
import { createHookRegistry } from '@vitamin/hooks'
import { invariant } from '@vitamin/invariant'
import { buildAgentSession } from './agent-session-factory'
import { AgentSession } from './agent-session'

import { createAgentWithRegistry, type AgentMessage, type AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session, SessionPersistence } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'
import type { Logger } from '@vitamin/shared'
import type {
  AgentSessionOptions,
  AgentSessionInfo,
} from './types'

export interface SessionManagerOptions {
  model: Model
  systemPrompt: string
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxToolTurns: number
  hookRegistry: HookRegistry
  providerRegistry: ProviderRegistry
  workspaceDir: string
  maxSessions: number
  idleTimeoutMs: number
  // 会话持久化后端
  persistence: SessionPersistence<AgentMessage>
  // 会话文件存储目录（传入后自动使用文件持久化）
  sessionDir?: string
  // 会话远程存储 URL（传入后自动使用远程持久化）
  sessionUrl?: string
  // 开发工具 
  devtools?: Devtools
  logger: Logger
}

export class CodingSessionManager {
  private sessionManager: SessionManager<AgentMessage>
  private agentSessions = new Map<string, AgentSession>()
  private options: SessionManagerOptions
  private hookRegistry: HookRegistry
  private logger: Logger
  private model: Model
  private systemPrompt: string
  private devtools?: Devtools

  constructor(
    sessionManager: SessionManager<AgentMessage>,
    options: SessionManagerOptions,
  ) {
    const { hookRegistry, logger, devtools, model, systemPrompt } = options
    this.options = options
    this.model = model
    this.hookRegistry = hookRegistry
    this.sessionManager = sessionManager
    this.systemPrompt = systemPrompt
    
    this.logger = logger
    this.devtools = devtools
  }

  get active(): AgentSession | undefined {
    const rawActive = this.sessionManager.active
    if (!rawActive) return undefined

    return this.agentSessions.get(rawActive.id)
  }

  private createManagedAgentSession(
    session: Session<AgentMessage>,
    model: Model,
    systemPrompt: string,
    tools: AgentTool[],
    thinkingLevel: ThinkingLevel,
    maxToolTurns: number,
    workspaceDir: string,
    providerRegistry: ProviderRegistry,
    promptRefresh: () => string | undefined
  ): AgentSession {
    const agent = createAgentWithRegistry({
      model,
      providerRegistry,
    })

    return new AgentSession(session, agent, {
      model,
      systemPrompt,
      tools,
      thinkingLevel,
      maxToolTurns,
      hookRegistry: this.hookRegistry,
      workspaceDir: workspaceDir,
      devtools: this.devtools,
      logger: this.logger,
      promptRefresh
    })
  }

  // 创建新的 AgentSession 并设为活跃
  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    const model = options.model ?? this.model
    if (!model) {
      throw new Error('No model specified. Provide model in createSession options or CodingSessionManager options.')
    }

    const sessionId = options.id
    const rawSession = await this.sessionManager.create(sessionId)

    const agentSession = this.createManagedAgentSession(rawSession, {
      model,
      systemPrompt: options.systemPrompt ?? this.systemPrompt,
      tools: options?.tools ?? this.options.tools,
      thinkingLevel: options?.thinkingLevel ?? this.options.thinkingLevel,
      maxToolTurns: options?.maxToolTurns ?? this.options.maxToolTurns,
      workspaceDir: options?.workspaceDir ?? this.options.workspaceDir,
      providerRegistry: options?.providerRegistry ?? this.options.providerRegistry,
      logger: options?.logger ?? this.options.logger,
      promptRefresh: options?.promptRefresh,
    })

    this.agentSessions.set(sessionId, agentSession)

    await this.hookRegistry.emit('session.created', { sessionId, metadata: {} })
    this.logger.info('Session %s created', sessionId)

    invariant(() => {
      this.devtools?.debugger.pause({
        turn: 0,
        point: 'session_create',
        frameDepth: 0,
        messagesCount: 0,
        metadata: { sessionId, activeSessions: this.agentSessions.size },
      })
      return true
    }, `Session created: ${sessionId}`)

    return agentSession
  }

  // 获取 AgentSession
  getSession(id: string): AgentSession | undefined {
    return this.agentSessions.get(id)
  }

  // 列出所有活跃 AgentSession 信息
  listSessions(): AgentSessionInfo[] {
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

  // 移除并销毁 AgentSession
  async removeSession(id: string): Promise<boolean> {
    const agentSession = this.agentSessions.get(id)
    if (!agentSession) return false

    agentSession.dispose()
    this.agentSessions.delete(id)
    await this.sessionManager.delete(id)
    await this.hookRegistry.emit('session.deleted', { sessionId: id, metadata: {} })
    this.options.logger?.info('Session %s removed', id)

    return true
  }

  // Fork 一个 AgentSession，创建分支副本
  async forkSession(
    sourceId: string,
    id?: string,
  ): Promise<AgentSession> {
    const source = this.agentSessions.get(sourceId)
    if (!source) {
      throw new Error(`Source session ${sourceId} not found for forking.`)
    }

    const forked = this.sessionManager.fork(sourceId, id)
    if (!forked) {
      throw new Error(`Failed to fork session ${sourceId}.`)
    }

    const model = this.model
    if (!model) {
      throw new Error('No model available to create agent for forked session.')
    }

    const agentSession = this.createManagedAgentSession(forked, {
      model,
      systemPrompt: this.options.systemPrompt,
      tools: this.options.tools,
      thinkingLevel: this.options.thinkingLevel,
      maxToolTurns: this.options.maxToolTurns,
      workspaceDir: this.options.workspaceDir,
      providerRegistry: this.options.providerRegistry,
      logger: this.options.logger,
    })

    this.agentSessions.set(forked.id, agentSession)
    this.logger.info('Session %s forked from %s', forked.id, sourceId)

    invariant(() => {
      this.devtools?.debugger.pause({
        turn: 0,
        point: 'session_fork',
        frameDepth: 0,
        messagesCount: forked.messages().length,
        metadata: { sourceId, forkedId: forked.id },
      })
      return true
    }, `Session forked: ${sourceId} → ${forked.id}`)

    return agentSession
  }

  // 设置活跃会话 
  setActive(id: string): AgentSession | undefined {
    this.sessionManager.setActive(id)
    return this.agentSessions.get(id)
  }

  updateDefaults(options: Partial<SessionManagerOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    }
  }

  // 保存指定会话到持久化后端 
  async save(id: string): Promise<void> {
    await this.sessionManager.save(id)
  }

  // 从持久化后端恢复会话 
  async restore(id: string): Promise<AgentSession | null> {
    const rawSession = await this.sessionManager.restore(id)
    if (!rawSession) return null

    // 已经存在的 AgentSession 直接返回
    if (this.agentSessions.has(rawSession.id)) {
      return this.agentSessions.get(rawSession.id)!
    }

    const model = this.options.model
    if (!model) return null

    const agentSession = this.createManagedAgentSession(rawSession, {
      model,
      systemPrompt: this.options.systemPrompt,
      tools: this.options.tools,
      thinkingLevel: this.options.thinkingLevel,
      maxToolTurns: this.options.maxToolTurns,
      workspaceDir: this.options.workspaceDir,
      providerRegistry: this.options.providerRegistry,
      logger: this.options.logger,
    })

    this.agentSessions.set(rawSession.id, agentSession)
    this.options.logger?.info('Session %s restored', rawSession.id)

    invariant(() => {
      this.options.devtools?.debugger.pause({
        turn: 0,
        point: 'session_restore',
        frameDepth: 0,
        messagesCount: rawSession.messages().length,
        metadata: { sessionId: rawSession.id },
      })
      return true
    }, `Session restored: ${rawSession.id}`)

    return agentSession
  }

  async saveAll(): Promise<void> {
    await this.sessionManager.saveAll()
  }

  async restoreAll(): Promise<number> {
    const count = await this.sessionManager.restoreAll()
    // 为恢复的 raw session 创建 AgentSession
    for (const rawSession of this.sessionManager.list()) {
      if (!this.agentSessions.has(rawSession.id)) {
        const model = this.options.model
        if (!model) continue

        const agentSession = this.createManagedAgentSession(rawSession, {
          model,
          systemPrompt: this.options.systemPrompt,
          tools: this.options.tools,
          thinkingLevel: this.options.thinkingLevel,
          maxToolTurns: this.options.maxToolTurns,
          workspaceDir: this.options.workspaceDir,
          providerRegistry: this.options.providerRegistry,
          logger: this.options.logger,
        })

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

export function createDiskCodingSessionManager(options: SessionManagerOptions): CodingSessionManager {
  const { sessionDir } = options
  const sm = createDiskSessionManager<AgentMessage>(sessionDir, {
    maxSessions: options.maxSessions,
    idleTimeoutMs: options.idleTimeoutMs,
  })

  return new CodingSessionManager(sm, { ...options, sessionDir })
}

export function createRemoteCodingSessionManager(options: SessionManagerOptions): CodingSessionManager {
  if (!options.sessionUrl) {
    throw new Error('sessionUrl is required for remote session manager.')
  }

  return CodingSessionManager.remote(options.sessionUrl, options)
}

export function createInMemoryCodingSessionManager(
  options: Omit<SessionManagerOptions, 'sessionDir' | 'persistence'> = {},
): CodingSessionManager {
  return CodingSessionManager.inMemory(options)
}


