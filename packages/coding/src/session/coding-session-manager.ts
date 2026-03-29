import { 
  createFileSessionManager, 
  createRemoteSessionManager, 
  SessionManager 
} from '@vitamin/session'
import { createHookRegistry } from '@vitamin/hooks'
import { invariant } from '@vitamin/invariant'
import { buildAgentSession } from './agent-session-factory'
import { AgentSession } from './agent-session'

import type { AgentMessage, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session, SessionPersistence } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'
import type { createLogger, Logger } from '@vitamin/shared'
import type {
  AgentSessionOptions,
  AgentSessionInfo,
} from './types'
import { createInMemorySessionManager } from 'node_modules/@vitamin/session/src/session-manager'

export interface SessionManagerOptions {
  // 默认模型
  model?: Model
  // 默认系统提示词
  systemPrompt?: string
  // 默认工具列表
  tools?: AgentTool[]
  // 默认思维级别
  thinkingLevel?: ThinkingLevel
  // 默认最大连续工具轮次
  maxToolTurns?: number
  // Hook 注册表
  hooks?: HookRegistry
  // Provider 注册表
  providerRegistry?: ProviderRegistry
  // 工作目录
  workspaceDir?: string
  // 最大并发会话数
  maxSessions?: number
  // 空闲超时（毫秒）
  idleTimeoutMs?: number
  // 会话持久化后端
  persistence?: SessionPersistence<AgentMessage>
  // 会话文件存储目录（传入后自动使用文件持久化）
  sessionDir?: string
  // 会话远程存储 URL（传入后自动使用远程持久化）
  sessionUrl?: string
  // 开发工具 
  devtools?: Devtools
  // 用户视角日志
  logger?: ReturnType<typeof createLogger>
}

export class CodingSessionManager {
  private sessionManager: SessionManager<AgentMessage>
  private agentSessions = new Map<string, AgentSession>()
  private options: SessionManagerOptions
  private hooks: HookRegistry

  constructor(
    sessionManager: SessionManager<AgentMessage>,
    options: SessionManagerOptions,
  ) {
    this.sessionManager = sessionManager
    this.options = options
    this.hooks = options.hooks ?? createHookRegistry({ preset: 'default' })
  }

  static create(
    sessionDir: string,
    options: Omit<SessionManagerOptions, 'sessionDir'> = {},
  ): CodingSessionManager {
    const sm = createFileSessionManager<AgentMessage>(sessionDir, {
      maxSessions: options.maxSessions,
      idleTimeoutMs: options.idleTimeoutMs,
    })

    return new CodingSessionManager(sm, { ...options, sessionDir })
  }

  static remote(
    sessionUrl: string,
    options: Omit<SessionManagerOptions, 'sessionUrl'> = {},
  ): CodingSessionManager {
    const sm = createRemoteSessionManager<AgentMessage>(sessionUrl, {
      maxSessions: options.maxSessions,
      idleTimeoutMs: options.idleTimeoutMs,
    })

    return new CodingSessionManager(sm, { ...options, sessionUrl })
  }

  static inMemory(
    options: Omit<SessionManagerOptions, 'sessionDir' | 'sessionUrl' | 'persistence'> = {},
  ): CodingSessionManager {
    const sm = createInMemorySessionManager<AgentMessage>(options)
    return new CodingSessionManager(sm, options)
  }

  private createManagedAgentSession(
    session: Session<AgentMessage>,
    options: {
      model: Model
      systemPrompt?: string
      tools?: AgentTool[]
      thinkingLevel?: ThinkingLevel
      maxToolTurns?: number
      workspaceDir?: string
      providerRegistry?: ProviderRegistry
      logger?: Logger
      promptRefreshFn?: () => string | undefined
    },
  ): AgentSession {
    return buildAgentSession({
      session,
      model: options.model,
      systemPrompt: options.systemPrompt,
      tools: options.tools,
      thinkingLevel: options.thinkingLevel,
      maxToolTurns: options.maxToolTurns,
      hooks: this.hooks,
      providerRegistry: options.providerRegistry,
      workspaceDir: options.workspaceDir,
      devtools: this.options.devtools,
      logger: options.logger ?? this.options.logger,
      promptRefreshFn: options.promptRefreshFn,
    })
  }

  // 创建新的 AgentSession 并设为活跃
  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    const model = options?.model ?? this.options.model
    if (!model) {
      throw new Error('No model specified. Provide model in createSession options or CodingSessionManager options.')
    }

    const sessionId = options?.id ?? crypto.randomUUID()
    const rawSession = await this.sessionManager.create(sessionId)

    const agentSession = this.createManagedAgentSession(rawSession, {
      model,
      systemPrompt: options?.systemPrompt ?? this.options.systemPrompt,
      tools: options?.tools ?? this.options.tools,
      thinkingLevel: options?.thinkingLevel ?? this.options.thinkingLevel,
      maxToolTurns: options?.maxToolTurns ?? this.options.maxToolTurns,
      workspaceDir: options?.workspaceDir ?? this.options.workspaceDir,
      providerRegistry: options?.providerRegistry ?? this.options.providerRegistry,
      logger: options?.logger ?? this.options.logger,
      promptRefreshFn: options?.promptRefreshFn,
    })

    this.agentSessions.set(sessionId, agentSession)
    await this.hooks.emit('session.created', { sessionId, metadata: {} })
    this.options.logger?.info('Session %s created', sessionId)

    invariant(() => {
      this.options.devtools?.debugger.pause({
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
    await this.hooks.emit('session.deleted', { sessionId: id, metadata: {} })
    this.options.logger?.info('Session %s removed', id)

    return true
  }

  // Fork 一个 AgentSession，创建分支副本
  async forkSession(
    sourceId: string,
    newId?: string,
  ): Promise<AgentSession | undefined> {
    const source = this.agentSessions.get(sourceId)
    if (!source) return undefined

    const forked = this.sessionManager.fork(sourceId, newId)
    if (!forked) return undefined

    const model = this.options.model
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
    this.options.logger?.info('Session %s forked from %s', forked.id, sourceId)

    invariant(() => {
      this.options.devtools?.debugger.pause({
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

  // 获取当前活跃会话 
  get active(): AgentSession | undefined {
    const rawActive = this.sessionManager.active
    if (!rawActive) return undefined
    return this.agentSessions.get(rawActive.id)
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

  // 保存所有会话 
  async saveAll(): Promise<void> {
    await this.sessionManager.saveAll()
  }

  // 恢复所有持久化会话 
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

function createFileCodingSessionManager(options: SessionManagerOptions): CodingSessionManager {
  if (!options.sessionDir) {
    throw new Error('sessionDir is required for file-based session manager.')
  }
  return CodingSessionManager.create(options.sessionDir, options)
}

function createRemoteCodingSessionManager(options: SessionManagerOptions): CodingSessionManager {
  if (!options.sessionUrl) {
    throw new Error('sessionUrl is required for remote session manager.')
  }
  return CodingSessionManager.remote(options.sessionUrl, options)
}

// 纯内存模式（测试 / 嵌入式）
function createInMemoryCodingSessionManager(
  options: Omit<SessionManagerOptions, 'sessionDir' | 'persistence'> = {},
): CodingSessionManager {
  return CodingSessionManager.inMemory(options)
}

export function createSessionManager(options: SessionManagerOptions): CodingSessionManager {
  if (options.sessionDir) {
    return createFileCodingSessionManager(options)
  } else if (options.sessionUrl) {
    return createRemoteCodingSessionManager(options)
  } 

  return createInMemoryCodingSessionManager(options)
}

export const createCodingSessionManager = createSessionManager
