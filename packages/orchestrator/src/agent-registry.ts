import type {
  AgentRegistry as IAgentRegistry,
  AgentSpec,
  BackgroundManager,
  SessionFactory,
  ToolRegistryHandle,
} from './types'
import type { CompositeRouter, RoutingContext } from './routing-strategy'
import { resolveAgentTools } from './session-utils'

export interface AgentRegistryDeps {
  sessionFactory: SessionFactory
  toolRegistry: ToolRegistryHandle
  backgroundManager?: BackgroundManager
  router?: CompositeRouter
}

class AgentRegistry implements IAgentRegistry {
  private agents = new Map<string, AgentSpec>()
  private fallback: AgentSpec | undefined
  private readonly sessionFactory: SessionFactory
  private readonly toolRegistry: ToolRegistryHandle
  private backgroundManager: BackgroundManager | undefined
  private readonly router: CompositeRouter | undefined

  constructor(deps: AgentRegistryDeps) {
    this.sessionFactory = deps.sessionFactory
    this.toolRegistry = deps.toolRegistry
    this.backgroundManager = deps.backgroundManager
    this.router = deps.router
  }

  register(spec: AgentSpec): void {
    this.agents.set(spec.name, spec)
  }

  get(name: string): AgentSpec | undefined {
    return this.agents.get(name)
  }

  resolve(query: { name?: string; category?: string }): AgentSpec | undefined {
    // 1. 精确名称匹配（始终优先）
    if (query.name) {
      const exact = this.agents.get(query.name)
      if (exact) return exact
    }

    // 2. 使用策略路由器（如果配置）
    if (this.router && query.category) {
      const agents = Array.from(this.agents.values())
      const context: RoutingContext = {
        prompt: '',
        category: query.category,
        requiredCapabilities: query.category ? [query.category] : undefined,
      }
      const result = this.router.route(agents, context)
      if (result) return result.spec
    }

    // 3. 按 category 匹配 capabilities（基础 fallback）
    if (query.category) {
      for (const spec of this.agents.values()) {
        if (spec.capabilities?.includes(query.category)) {
          return spec
        }
      }
    }

    // 4. 回退到 fallback agent
    return this.fallback
  }

  list(): AgentSpec[] {
    return Array.from(this.agents.values())
  }

  setFallback(spec: AgentSpec): void {
    this.fallback = spec
    this.agents.set(spec.name, spec)
  }

  setBackgroundManager(bgm: BackgroundManager): void {
    this.backgroundManager = bgm
  }

  async call(
    agent: string,
    prompt: string,
    options?: { mode?: 'sync' | 'async'; sessionId?: string },
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const spec = this.resolve({ name: agent })
    if (!spec) {
      return { success: false, error: `Agent "${agent}" not found` }
    }

    // mode=async → 通过 BackgroundManager 异步执行
    if (options?.mode === 'async') {
      if (!this.backgroundManager) {
        return { success: false, error: 'BackgroundManager not available for async mode' }
      }
      const task = {
        id: crypto.randomUUID(),
        kind: 'agent_call' as const,
        status: 'pending' as const,
        mode: 'background' as const,
        input: { prompt, subagent: agent, sessionId: options.sessionId },
        attempts: 0,
        maxAttempts: 3,
        correlationId: crypto.randomUUID(),
        createdAt: Date.now(),
      }
      const taskId = await this.backgroundManager.submit(task, spec)
      return { success: true, output: `Submitted as background task: ${taskId}` }
    }

    // mode=sync（默认）→ 直接执行
    try {
      const tools = resolveAgentTools(spec, this.toolRegistry)

      // Phase 2: sessionId 支持跨调用上下文复用
      let session: import('./types').AgentSessionHandle | undefined
      let isReused = false

      if (options?.sessionId && this.sessionFactory.getSession) {
        session = this.sessionFactory.getSession(options.sessionId)
        if (session) isReused = true
      }

      if (!session) {
        session = await this.sessionFactory.createSession({
          id: options?.sessionId,
          model: spec.model as never,
          systemPrompt: spec.systemPrompt,
          tools,
          maxToolTurns: spec.maxToolTurns,
        })
        isReused = Boolean(options?.sessionId)
      }

      try {
        await session.prompt(prompt)
        const output = session.getLastAssistantText() ?? ''
        return { success: true, output }
      } finally {
        // Only clean up sessions we created ourselves
        if (!isReused) {
          await this.sessionFactory.removeSession(session.id)
        }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

export function createAgentRegistry(deps: AgentRegistryDeps): IAgentRegistry {
  return new AgentRegistry(deps)
}
