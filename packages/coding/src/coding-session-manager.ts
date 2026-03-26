import { createFileSessionManager, createRemoteSessionManager, SessionManager } from '@vitamin/session'
import { createAgentWithRegistry } from '@vitamin/agent'
import { createHookRegistry } from '@vitamin/hooks'
import {
  createDefaultProviderRegistry,
} from '@vitamin/ai'
import { invariant } from '@vitamin/invariant'
import { AgentSession } from './agent-session'

import type { AgentMessage, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { SessionPersistence } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'
import type {
  AgentSessionOptions,
  AgentSessionInfo,
} from './types'

export interface SessionManagerOptions {
  // 默认模型
  model?: Model
  // 默认系统提示词
  systemPrompt?: string
  // 默认工具列表
  tools?: AgentTool[]
  // 默认思维级别
  thinkingLevel?: ThinkingLevel
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
}

// SessionManager — 面向 coding-agent 的高层会话管理器
// 桥接 @vitamin/session 的 SessionManager 与 AgentSession：
// - 创建/销毁 AgentSession（Agent + Session 成对管理）
// - 支持文件持久化、内存模式
// - 活跃会话追踪
// - Fork 支持
// - 会话保存与恢复
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

  private resolveProviderRegistry(model: Model, explicit?: ProviderRegistry): ProviderRegistry | undefined {
    if (explicit) {
      return explicit
    }

    if (model.api !== 'github-copilot') {
      return undefined
    }

    return createDefaultProviderRegistry()
  }

  // 创建新的 AgentSession 并设为活跃
  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    const model = options?.model ?? this.options.model
    if (!model) {
      throw new Error('No model specified. Provide model in createSession options or CodingSessionManager options.')
    }

    const sessionId = options?.id ?? crypto.randomUUID()
    const rawSession = await this.sessionManager.create(sessionId)

    const providerRegistry = this.resolveProviderRegistry(
      model,
      options?.providerRegistry ?? this.options.providerRegistry,
    )

    const agent = createAgentWithRegistry({
      model,
      providerRegistry,
    })

    const workspaceDir = options?.workspaceDir ?? this.options.workspaceDir

    const agentSession = new AgentSession(rawSession, agent, {
      model,
      systemPrompt: options?.systemPrompt ?? this.options.systemPrompt ?? '',
      tools: options?.tools ?? this.options.tools,
      thinkingLevel: options?.thinkingLevel ?? this.options.thinkingLevel,
      hooks: this.hooks,
      workspaceDir,
      devtools: this.options.devtools,
    })

    this.agentSessions.set(sessionId, agentSession)
    await this.hooks.emit('session.created', { sessionId, metadata: {} })

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

    const providerRegistry = this.resolveProviderRegistry(model, this.options.providerRegistry)

    const agent = createAgentWithRegistry({
      model,
      providerRegistry,
    })

    const agentSession = new AgentSession(forked, agent, {
      model,
      systemPrompt: this.options.systemPrompt ?? '',
      tools: this.options.tools,
      thinkingLevel: this.options.thinkingLevel,
      hooks: this.hooks,
      workspaceDir: this.options.workspaceDir,
      devtools: this.options.devtools,
    })

    this.agentSessions.set(forked.id, agentSession)

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

    const providerRegistry = this.resolveProviderRegistry(model, this.options.providerRegistry)

    const agent = createAgentWithRegistry({
      model,
      providerRegistry,
    })

    const agentSession = new AgentSession(rawSession, agent, {
      model,
      systemPrompt: this.options.systemPrompt ?? '',
      tools: this.options.tools,
      thinkingLevel: this.options.thinkingLevel,
      hooks: this.hooks,
      workspaceDir: this.options.workspaceDir,
      devtools: this.options.devtools,
    })

    this.agentSessions.set(rawSession.id, agentSession)

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

        const providerRegistry = this.resolveProviderRegistry(model, this.options.providerRegistry)

        const agent = createAgentWithRegistry({
          model,
          providerRegistry,
        })

        const agentSession = new AgentSession(rawSession, agent, {
          model,
          systemPrompt: this.options.systemPrompt ?? '',
          tools: this.options.tools,
          thinkingLevel: this.options.thinkingLevel,
          hooks: this.hooks,
          workspaceDir: this.options.workspaceDir,
          devtools: this.options.devtools,
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
  const sm = createFileSessionManager<AgentMessage>(options.sessionDir, {
    maxSessions: options.maxSessions,
    idleTimeoutMs: options.idleTimeoutMs,
  })
  return new CodingSessionManager(sm, options)
}

function createRemoteCodingSessionManager(options: SessionManagerOptions): CodingSessionManager {
  if (!options.sessionUrl) {
    throw new Error('sessionUrl is required for remote session manager.')
  }
  const sm = createRemoteSessionManager<AgentMessage>(options.sessionUrl, {
    maxSessions: options.maxSessions,
    idleTimeoutMs: options.idleTimeoutMs,
  })
  return new CodingSessionManager(sm, options)
}

// 纯内存模式（测试 / 嵌入式）
function createInMemoryCodingSessionManager(
  options: Omit<SessionManagerOptions, 'sessionDir' | 'persistence'> = {},
): CodingSessionManager {
  const sm = SessionManager.inMemory<AgentMessage>({
    maxSessions: options.maxSessions,
    idleTimeoutMs: options.idleTimeoutMs,
  })
  return new CodingSessionManager(sm, options)
}

export function createCodingSessionManager(options: SessionManagerOptions): CodingSessionManager {
  if (options.sessionDir) {
    return createFileCodingSessionManager(options)
  } else if (options.sessionUrl) {
    return createRemoteCodingSessionManager(options)
  } 

  return createInMemoryCodingSessionManager(options)
}
