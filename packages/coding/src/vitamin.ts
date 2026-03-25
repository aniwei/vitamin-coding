
import { Devtools } from '@vitamin/devtools'
import { createLogger } from '@vitamin/shared'
import { loadConfig } from '@vitamin/config'
import { attachLogListener } from '@vitamin/shared'
import { createInMemorySessionStore } from '@vitamin/session'
import { createAgent } from '@vitamin/agent'
import { AgentSession } from './agent-session'

import type { SessionStore } from '@vitamin/session'
import type { AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry } from '@vitamin/ai'
import type {
  SystemContext,
  AgentSessionOptions,
  AgentSessionInfo,
} from './types'

// ═══ VitaminApp 配置 ═══

interface VitaminAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
  /** 自定义 SessionStore 实现（默认 InMemorySessionStore） */
  sessionStore?: SessionStore
  /** 默认模型 */
  model?: Model
  /** 默认工具集 */
  tools?: AgentTool[]
  /** Provider 注册表 */
  providerRegistry?: ProviderRegistry
  /** 默认系统提示词 */
  systemPrompt?: string
}

// ═══ VitaminApp 主类 ═══

/**
 * VitaminApp — 多会话 Agent 应用容器。
 *
 * 设计参照:
 * - pi-mono: createAgentSession() 工厂 + AgentSession 控制器
 * - OpenClaw: Gateway 管理多个隔离会话
 *
 * 核心职责:
 * 1. 管理多个并发 AgentSession（创建、检索、列举、销毁）
 * 2. 共享基础设施（config、logger、devtools、providerRegistry）
 * 3. 提供统一 SystemContext 接口
 *
 * 每个 AgentSession 拥有:
 * - 独立的 Agent 实例（状态机 + 工具调用循环）
 * - 独立的 Session 存储（消息历史）
 * - 独立的事件流
 */
class VitaminApp implements SystemContext {
  private devtools: Devtools | null = null
  private globalLogSubscription: ReturnType<typeof attachLogListener> | null = null
  private sessionStore: SessionStore
  private activeSessions = new Map<string, AgentSession>()
  private options: VitaminAppOptions

  public config: Awaited<ReturnType<typeof loadConfig>>
  public logger: ReturnType<typeof createLogger>

  constructor(options: VitaminAppOptions) {
    this.options = options

    if (options.inspect) {
      this.devtools = new Devtools(options.port)

      this.globalLogSubscription = attachLogListener((data) => {
        const log = data as { name: string; level: string; msg: string }
        if (log.name === 'vitamin-app') {
          this.devtools?.logger.publish(log)
        }
      })
    }

    this.logger = createLogger(options.logger.name, {
      level: options.logger.level,
      destination: options.logger.destination,
    })

    this.config = {} as Awaited<ReturnType<typeof loadConfig>>
    this.sessionStore = options.sessionStore ?? createInMemorySessionStore()
  }

  // ──── 会话管理（多会话核心） ────

  /**
   * 创建新的 AgentSession。
   *
   * 每次调用创建一个独立的 Agent + Session 对，
   * 类似 pi-mono 的 createAgentSession() 工厂。
   */
  async createSession(options?: AgentSessionOptions): Promise<AgentSession> {
    const sessionId = options?.id ?? crypto.randomUUID()
    const session = this.sessionStore.createSession(sessionId)

    // 使用提供的配置或回退到 VitaminApp 默认值
    const model = options?.model ?? this.options.model
    const tools = options?.tools ?? this.options.tools ?? []
    const systemPrompt = options?.systemPrompt ?? this.options.systemPrompt ?? ''

    if (!model) {
      throw new Error(
        'No model specified. Provide model in createSession options or VitaminApp options.',
      )
    }

    const agent = createAgent({
      model,
      systemPrompt,
      tools,
      thinkingLevel: options?.thinkingLevel,
      ...(options?.agentConfig ?? {}),
    })

    const agentSession = new AgentSession(session, agent)

    this.activeSessions.set(sessionId, agentSession)

    this.logger.info('Session created: %s', sessionId)
    return agentSession
  }

  /**
   * 通过 ID 检索活跃的 AgentSession。
   */
  getSession(id: string): AgentSession | undefined {
    return this.activeSessions.get(id)
  }

  /**
   * 列举所有活跃 AgentSession 的信息。
   */
  listSessions(): AgentSessionInfo[] {
    const result: AgentSessionInfo[] = []
    for (const [id, agentSession] of this.activeSessions) {
      result.push({
        id,
        messageCount: agentSession.session.messages().length,
        createdAt: new Date(),
        status: agentSession.status,
      })
    }
    return result
  }

  /**
   * 移除并销毁一个 AgentSession。
   */
  removeSession(id: string): boolean {
    const session = this.activeSessions.get(id)
    if (!session) return false

    session.dispose()
    this.activeSessions.delete(id)
    this.logger.info('Session removed: %s', id)
    return true
  }

  // ──── 生命周期 ────

  async start() {
    this.config = await loadConfig()

    if (this.devtools) {
      await this.devtools.start()
    }

    this.logger.info('VitaminApp started')
  }

  async stop() {
    // 销毁所有活跃会话
    for (const [id, session] of this.activeSessions) {
      session.dispose()
      this.logger.debug('Session disposed on stop: %s', id)
    }
    
    this.activeSessions.clear()

    if (this.devtools) {
      await this.devtools.stop()

      if (this.globalLogSubscription) {
        this.globalLogSubscription()
        this.globalLogSubscription = null
      }
    }

    this.logger.info('VitaminApp stopped')
  }
}

export function createVitamin(options: VitaminAppOptions): VitaminApp {
  return new VitaminApp(options)
}