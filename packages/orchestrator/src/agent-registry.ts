import type {
  AgentRegistry as IAgentRegistry,
  AgentSpec,
  BackgroundManager,
  SessionFactory,
  ToolRegistryHandle,
} from './types'

export interface AgentRegistryDeps {
  sessionFactory: SessionFactory
  toolRegistry: ToolRegistryHandle
  backgroundManager?: BackgroundManager
}

class AgentRegistryImpl implements IAgentRegistry {
  private agents = new Map<string, AgentSpec>()
  private fallback: AgentSpec | undefined
  private deps: AgentRegistryDeps

  constructor(deps: AgentRegistryDeps) {
    this.deps = deps
  }

  register(spec: AgentSpec): void {
    this.agents.set(spec.name, spec)
  }

  get(name: string): AgentSpec | undefined {
    return this.agents.get(name)
  }

  resolve(query: { name?: string; category?: string }): AgentSpec | undefined {
    // 1. 精确名称匹配
    if (query.name) {
      const exact = this.agents.get(query.name)
      if (exact) return exact
    }

    // 2. 按 category 匹配 capabilities
    if (query.category) {
      for (const spec of this.agents.values()) {
        if (spec.capabilities?.includes(query.category)) {
          return spec
        }
      }
    }

    // 3. 回退到 fallback agent
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
    this.deps.backgroundManager = bgm
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
      if (!this.deps.backgroundManager) {
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
      const taskId = await this.deps.backgroundManager.submit(task, spec)
      return { success: true, output: `Submitted as background task: ${taskId}` }
    }

    // mode=sync（默认）→ 直接执行
    try {
      const tools = this.deps.toolRegistry.filterByNames(spec.tools ?? [])

      // Phase 2: sessionId 将支持跨调用上下文复用（需 SessionFactory.getSession）。
      // Phase 1: 始终创建隔离子会话，sessionId 参数被接受但不生效。
      const session = await this.deps.sessionFactory.createSession({
        model: spec.model as never,
        systemPrompt: spec.systemPrompt,
        tools,
      })

      try {
        await session.prompt(prompt)
        const output = session.getLastAssistantText() ?? ''
        return { success: true, output }
      } finally {
        await this.deps.sessionFactory.removeSession(session.id)
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

export function createAgentRegistry(deps: AgentRegistryDeps): IAgentRegistry {
  return new AgentRegistryImpl(deps)
}
