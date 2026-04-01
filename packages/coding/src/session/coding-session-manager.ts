import { 
  SessionManager, 
  createDiskSessionManager, 
  createInMemorySessionManager,
  createRemoteSessionManager, 
} from '@vitamin/session'
import { invariant } from '@vitamin/invariant'
import { AgentSession } from './agent-session'

import { 
  createAgentWithRegistry, 
  type AgentMessage, 
  type AgentTool 
} from '@vitamin/agent'
import type { Model, ProviderRegistry, ThinkingLevel } from '@vitamin/ai'
import type { HookRegistry } from '@vitamin/hooks'
import type { Session } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'
import type { Logger } from '@vitamin/shared'
import type {
  AgentSessionOptions,
  AgentSessionInfo,
  PromptRefresh,
} from './types'
import type { SessionManagerOptions } from '@vitamin/session'

export interface CodingSessionManagerOptions extends Omit<SessionManagerOptions<AgentMessage>, 'store'> {
  model: Model
  systemPrompt: string
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxToolTurns: number
  hookRegistry: HookRegistry
  providerRegistry: ProviderRegistry
  workspaceDir: string
  maxSessions?: number
  idleTimeoutMs?: number
  threshold?: number
  logger: Logger
  devtools?: Devtools
  promptRefresh: PromptRefresh
}

export interface DiskSessionManagerOptions extends CodingSessionManagerOptions {
  sessionDir: string
}

export interface RemoteSessionManagerOptions extends CodingSessionManagerOptions {
  sessionUrl: string
}

export class CodingSessionManager {
  private sessionManager: SessionManager<AgentMessage>
  private agentSessions = new Map<string, AgentSession>()
  private hookRegistry: HookRegistry
  private logger: Logger
  private devtools?: Devtools

  private model: Model
  private tools: AgentTool[]
  private thinkingLevel: ThinkingLevel
  private maxToolTurns: number
  private systemPrompt: string
  private providerRegistry: ProviderRegistry
  private workspaceDir: string
  private promptRefresh: PromptRefresh

  constructor(
    sessionManager: SessionManager<AgentMessage>,
    options: CodingSessionManagerOptions,
  ) {
    const { 
      hookRegistry, 
      providerRegistry,
      workspaceDir,
      logger, 
      devtools, 
      model, 
      tools,
      thinkingLevel,
      maxToolTurns,
      systemPrompt
    } = options
    
    this.model = model
    this.hookRegistry = hookRegistry
    this.sessionManager = sessionManager
    this.systemPrompt = systemPrompt
    this.workspaceDir = workspaceDir
    this.providerRegistry = providerRegistry
    this.tools = tools
    this.thinkingLevel = thinkingLevel
    this.maxToolTurns = maxToolTurns
    this.promptRefresh = options.promptRefresh
    
    this.logger = logger
    this.devtools = devtools
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

  private createManagedAgentSession(
    session: Session<AgentMessage>,
    options: Pick<AgentSessionOptions, 'model' | 'systemPrompt' | 'tools' | 'thinkingLevel' | 'maxToolTurns'>,
  ): AgentSession {
    const { model, systemPrompt, tools, thinkingLevel, maxToolTurns } = options

    const agent = createAgentWithRegistry({
      model,
      providerRegistry: this.providerRegistry,
    })

    return new AgentSession(session, agent, {
      model,
      systemPrompt,
      tools,
      thinkingLevel,
      maxToolTurns,
      providerRegistry: this.providerRegistry,
      hookRegistry: this.hookRegistry,
      workspaceDir: this.workspaceDir,
      devtools: this.devtools,
      logger: this.logger,
      promptRefresh: this.promptRefresh
    })
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    const model = options.model ?? this.model
    if (!model) {
      throw new Error('No model specified. Provide model in createSession options or CodingSessionManager options.')
    }

    const { id } = options
    if (!id) {
      throw new Error('Session ID is required in createSession options.')
    }

    if (this.agentSessions.has(id)) {
      throw new Error(`Session with ID ${id} already exists.`)
    }

    const sessionId = id
    const session = await this.sessionManager.create(sessionId)
    this.updateAgentSessionsWithStore()
    
    const tools = options.tools ?? this.tools
    const systemPrompt = options.systemPrompt ?? this.systemPrompt
    const thinkingLevel = options.thinkingLevel ?? this.thinkingLevel
    const maxToolTurns = options.maxToolTurns ?? this.maxToolTurns

    const agentSession = this.createManagedAgentSession(session, {
      model,
      systemPrompt,
      tools,
      thinkingLevel,
      maxToolTurns,
    })

    this.agentSessions.set(session.id, agentSession)

    await this.hookRegistry.emit('session.created', { sessionId: session.id, metadata: {} })
    this.logger.info('Session %s created', session.id)

    invariant(() => {
      this.devtools?.debugger.pause({
        turn: 0,
        point: 'session_create',
        frameDepth: 0,
        messagesCount: 0,
        metadata: { sessionId: session.id, activeSessions: this.agentSessions.size },
      })
      return true
    }, `Session created: ${session.id}`)

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
    
    this.logger?.info('Session %s removed', id)

    return true
  }

  async forkSession(
    sourceId: string,
    id?: string,
  ): Promise<AgentSession> {
    const source = this.agentSessions.get(sourceId)
    if (!source) {
      throw new Error(`Source session ${sourceId} not found for forking.`)
    }

    const forked = await this.sessionManager.fork(sourceId, id)
    if (!forked) {
      throw new Error(`Failed to fork session ${sourceId}.`)
    }

    const model = this.model
    if (!model) {
      throw new Error('No model available to create agent for forked session.')
    }

    const agentSession = this.createManagedAgentSession(forked, {
      model,
      systemPrompt: this.systemPrompt,
      tools: this.tools,
      thinkingLevel: this.thinkingLevel,
      maxToolTurns: this.maxToolTurns,
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

  setActive(id: string): AgentSession | undefined {
    this.updateAgentSessionsWithStore()
    this.sessionManager.setActive(id)
    return this.agentSessions.get(id)
  }

  updateDefaults(options: Partial<CodingSessionManagerOptions>): void {
    if (options.model) this.model = options.model
    if (options.systemPrompt) this.systemPrompt = options.systemPrompt
    if (options.tools) this.tools = options.tools
    if (options.thinkingLevel) this.thinkingLevel = options.thinkingLevel
    if (options.maxToolTurns) this.maxToolTurns = options.maxToolTurns
    if (options.providerRegistry) this.providerRegistry = options.providerRegistry
    if (options.workspaceDir) this.workspaceDir = options.workspaceDir
    if (options.promptRefresh) this.promptRefresh = options.promptRefresh
  }

  async save(id: string): Promise<void> {
    await this.sessionManager.save(id)
  }

  async restore(id: string): Promise<AgentSession | null> {
    const session = await this.sessionManager.restore(id)
    if (!session) return null

    this.updateAgentSessionsWithStore()

    // 已经存在的 AgentSession 直接返回
    if (this.agentSessions.has(session.id)) {
      return this.agentSessions.get(session.id)!
    }

    const model = this.model
    if (!model) return null

    const agentSession = this.createManagedAgentSession(session, {
      model,
      systemPrompt: this.systemPrompt,
      tools: this.tools,
      thinkingLevel: this.thinkingLevel,
      maxToolTurns: this.maxToolTurns,
    })

    this.agentSessions.set(session.id, agentSession)
    this.logger.info('Session %s restored', session.id)

    invariant(() => {
      this.devtools?.debugger.pause({
        turn: 0,
        point: 'session_restore',
        frameDepth: 0,
        messagesCount: session.messages().length,
        metadata: { sessionId: session.id },
      })
      return true
    }, `Session restored: ${session.id}`)

    return agentSession
  }

  async saveAll(): Promise<void> {
    await this.sessionManager.saveAll()
  }

  async restoreAll(): Promise<number> {
    const count = await this.sessionManager.restoreAll()
    this.updateAgentSessionsWithStore()
    
    for (const rawSession of this.sessionManager.list()) {
      if (!this.agentSessions.has(rawSession.id)) {
        const model = this.model
        if (!model) continue

        const agentSession = this.createManagedAgentSession(rawSession, {
          model,
          systemPrompt: this.systemPrompt,
          tools: this.tools,
          thinkingLevel: this.thinkingLevel,
          maxToolTurns: this.maxToolTurns,
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

  return new CodingSessionManager(sm, { ...options })
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

  return new CodingSessionManager(sm, { ...options })
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


