import { createLogger, TypedEventEmitter } from '@vitamin/shared'

import { createSwarmContext } from './context'
import { createHandoffTool, validateHandoff } from './handoff'
import { SwarmRouter } from './router'
import {
  executeSequential,
  executeParallel,
  executeHierarchical,
  executeAgentTurn,
} from './patterns'
import { AgentNotFoundError, HandoffDepthError, SwarmConfigError } from './errors'

import type {
  HandoffRequest,
  HandoffResult,
  HierarchicalResult,
  ParallelResult,
  ParallelTask,
  PipelineStepResult,
  SwarmAgentDef,
  SwarmAgentId,
  SwarmConfig,
  SwarmContext,
  SwarmEventHandler,
  SwarmTurnResult,
} from './types'

const logger = createLogger('@vitamin/swarm')

type SwarmEvents = {
  [key: string]: (...args: unknown[]) => void
}

/**
 * Swarm — 多 Agent 协作框架
 *
 * 综合了多个开源 Agent 框架的设计理念：
 *
 * - **Handoff 模式**（OpenAI Swarm）：Agent 自主决定向谁交接控制权
 * - **并行 Fleet**（OpenDev Agent Fleet）：多 Agent 同时工作，结果聚合
 * - **层级委派**（InfiAgent MLA 树形结构）：Supervisor 分解任务，Worker 执行
 * - **流水线**（gstack Sprint 流程）：Agent 按角色顺序执行
 * - **路由**（Deep Agents sub-agent、Open Agent SDK subagents）：动态分发消息
 *
 * 核心设计原则：
 * 1. Swarm 不持有 Agent 运行时 — 通过 createRunContext 工厂由宿主注入
 * 2. Agent 定义（SwarmAgentDef）是纯声明式的，运行时由 @vitamin/agent 引擎执行
 * 3. 编排模式通过组合模式实现，可嵌套使用
 */
export class Swarm extends TypedEventEmitter<SwarmEvents> {
  private readonly config: SwarmConfig
  private readonly agents: Map<string, SwarmAgentDef>
  private readonly router: SwarmRouter | null
  private context: SwarmContext

  constructor(config: SwarmConfig) {
    super()
    this.validateConfig(config)

    this.config = config
    this.agents = new Map()

    for (const agent of config.agents) {
      this.agents.set(agent.id, agent)
    }

    this.router = config.router ? new SwarmRouter(config.router) : null

    this.context = createSwarmContext()
  }

  /** 获取当前共享上下文 */
  getContext(): SwarmContext {
    return this.context
  }

  /** 重置上下文 */
  resetContext(): void {
    this.context = createSwarmContext()
  }

  /** 获取所有 Agent 定义 */
  getAgents(): SwarmAgentDef[] {
    return [...this.agents.values()]
  }

  /** 根据 ID 获取 Agent */
  getAgent(id: SwarmAgentId): SwarmAgentDef | undefined {
    return this.agents.get(id)
  }

  /**
   * 运行 Swarm — 根据配置的编排模式执行。
   * 根据 pattern 分发到对应的执行策略。
   */
  async run(input: string, options?: { signal?: AbortSignal }): Promise<SwarmRunResult> {
    const signal = options?.signal ?? new AbortController().signal
    const startTime = Date.now()

    const emit: SwarmEventHandler = (event) => {
      this.emit(event.type, event)
    }

    emit({
      type: 'swarm_start',
      pattern: this.config.pattern,
      agentCount: this.agents.size,
    })

    try {
      let result: SwarmRunResult

      switch (this.config.pattern) {
        case 'handoff':
          result = await this.runHandoff(input, signal, emit)
          break
        case 'sequential':
          result = await this.runSequential(input, signal, emit)
          break
        case 'parallel':
          result = await this.runParallel(input, signal, emit)
          break
        case 'hierarchical':
          result = await this.runHierarchical(input, signal, emit)
          break
        case 'router':
          result = await this.runRouter(input, signal, emit)
          break
        default:
          throw new SwarmConfigError(`Unknown pattern: ${this.config.pattern as string}`)
      }

      emit({ type: 'swarm_end', totalDurationMs: Date.now() - startTime })
      return result
    } catch (error) {
      emit({ type: 'swarm_end', totalDurationMs: Date.now() - startTime })
      throw error
    }
  }

  /**
   * 直接执行指定 Agent（旁路编排模式）
   */
  async runAgent(
    agentId: SwarmAgentId,
    input: string,
    options?: { signal?: AbortSignal },
  ): Promise<SwarmTurnResult> {
    const agentDef = this.agents.get(agentId)
    if (!agentDef) {
      throw new AgentNotFoundError(agentId)
    }

    const signal = options?.signal ?? new AbortController().signal

    return executeAgentTurn({
      agentDef,
      input,
      context: this.context,
      createRunContext: this.config.createRunContext,
      signal,
    })
  }

  /**
   * 并行执行多个任务（直接 API，旁路编排模式）
   */
  async runParallelTasks(
    tasks: ParallelTask[],
    options?: { signal?: AbortSignal; maxConcurrency?: number },
  ): Promise<ParallelResult> {
    const signal = options?.signal ?? new AbortController().signal
    const emit: SwarmEventHandler = (event) => this.emit(event.type, event)

    return executeParallel({
      tasks,
      agents: this.agents,
      context: this.context,
      createRunContext: this.config.createRunContext,
      signal,
      emit,
      maxConcurrency: options?.maxConcurrency ?? this.config.maxConcurrency,
    })
  }

  // ─── Handoff 模式 ───

  private async runHandoff(
    input: string,
    signal: AbortSignal,
    emit: SwarmEventHandler,
  ): Promise<SwarmRunResult> {
    const entryId = this.config.entryAgentId ?? this.config.agents[0]?.id
    if (!entryId) {
      throw new SwarmConfigError('No entry agent configured for handoff mode')
    }

    const maxDepth = this.config.maxHandoffDepth ?? 10
    let currentAgentId = entryId
    let currentInput = input
    const chain: SwarmAgentId[] = [currentAgentId]

    for (let depth = 0; depth < maxDepth; depth++) {
      if (signal.aborted) {
        break
      }

      const agentDef = this.agents.get(currentAgentId)
      if (!agentDef) {
        throw new AgentNotFoundError(currentAgentId)
      }

      // 构建可 handoff 的目标列表
      let handoffTargets = [...this.agents.values()].filter((a) => a.id !== currentAgentId)
      if (agentDef.handoffTargets && agentDef.handoffTargets.length > 0) {
        const allowedTargets = agentDef.handoffTargets
        handoffTargets = handoffTargets.filter((a) => allowedTargets.includes(a.id))
      }

      // 创建 handoff 工具
      let pendingHandoff: HandoffRequest | null = null

      const handoffTool =
        handoffTargets.length > 0
          ? createHandoffTool(currentAgentId, handoffTargets, (request) => {
              pendingHandoff = request
            })
          : null

      emit({ type: 'agent_start', agentId: currentAgentId })
      const startTime = Date.now()

      const turnResult = await executeAgentTurn({
        agentDef,
        input: currentInput,
        context: this.context,
        createRunContext: this.config.createRunContext,
        signal,
        extraTools: handoffTool ? [handoffTool] : undefined,
      })

      const durationMs = Date.now() - startTime
      emit({ type: 'agent_end', agentId: currentAgentId, durationMs })

      // 检查是否有 handoff 请求
      if (pendingHandoff) {
        const handoff: HandoffRequest = pendingHandoff
        const validation = validateHandoff(handoff, this.agents)
        if (!validation.valid) {
          // Handoff 无效，返回当前结果
          logger.warn('Invalid handoff: %s', validation.error)
          return {
            pattern: 'handoff',
            output: turnResult,
            handoff: { agentId: currentAgentId, response: turnResult, chain },
          }
        }

        emit({
          type: 'handoff',
          from: handoff.from,
          to: handoff.to,
          reason: handoff.reason,
        })

        this.context.handoffHistory.push(handoff)

        // 准备下一轮
        currentAgentId = handoff.to
        currentInput = handoff.reason
        chain.push(currentAgentId)
        continue
      }

      // 没有 handoff — 当前 Agent 完成
      return {
        pattern: 'handoff',
        output: turnResult,
        handoff: { agentId: currentAgentId, response: turnResult, chain },
      }
    }

    throw new HandoffDepthError(maxDepth, maxDepth)
  }

  // ─── Sequential 模式 ───

  private async runSequential(
    input: string,
    signal: AbortSignal,
    emit: SwarmEventHandler,
  ): Promise<SwarmRunResult> {
    const pipeline = this.config.pipeline ?? this.config.agents.map((a) => a.id)

    const { steps, finalOutput } = await executeSequential({
      pipeline,
      agents: this.agents,
      input,
      context: this.context,
      createRunContext: this.config.createRunContext,
      signal,
      emit,
    })

    return {
      pattern: 'sequential',
      output: finalOutput,
      pipeline: { steps, finalOutput },
    }
  }

  // ─── Parallel 模式 ───

  private async runParallel(
    input: string,
    signal: AbortSignal,
    emit: SwarmEventHandler,
  ): Promise<SwarmRunResult> {
    // 所有 Agent 接收相同输入
    const tasks: ParallelTask[] = this.config.agents.map((a) => ({
      agentId: a.id,
      input,
    }))

    const result = await executeParallel({
      tasks,
      agents: this.agents,
      context: this.context,
      createRunContext: this.config.createRunContext,
      signal,
      emit,
      maxConcurrency: this.config.maxConcurrency,
    })

    // 合并输出
    const combinedText = result.tasks.map((t) => `## ${t.agentId}\n${t.output.text}`).join('\n\n')

    const combinedOutput: SwarmTurnResult = {
      agentId: 'swarm',
      messages: [],
      text: combinedText,
      tokenUsage: result.tasks.reduce(
        (acc, t) => ({
          input: acc.input + t.output.tokenUsage.input,
          output: acc.output + t.output.tokenUsage.output,
          cacheRead: acc.cacheRead + t.output.tokenUsage.cacheRead,
        }),
        { input: 0, output: 0, cacheRead: 0 },
      ),
      durationMs: result.totalDurationMs,
    }

    return {
      pattern: 'parallel',
      output: combinedOutput,
      parallel: result,
    }
  }

  // ─── Hierarchical 模式 ───

  private async runHierarchical(
    input: string,
    signal: AbortSignal,
    emit: SwarmEventHandler,
  ): Promise<SwarmRunResult> {
    const supervisorId = this.config.supervisorId ?? this.config.agents[0]?.id
    if (!supervisorId) {
      throw new SwarmConfigError('No supervisor configured for hierarchical mode')
    }

    const result = await executeHierarchical({
      supervisorId,
      agents: this.agents,
      input,
      context: this.context,
      createRunContext: this.config.createRunContext,
      signal,
      emit,
      maxConcurrency: this.config.maxConcurrency,
    })

    return {
      pattern: 'hierarchical',
      output: result.synthesis,
      hierarchical: result,
    }
  }

  // ─── Router 模式 ───

  private async runRouter(
    input: string,
    signal: AbortSignal,
    emit: SwarmEventHandler,
  ): Promise<SwarmRunResult> {
    if (!this.router) {
      throw new SwarmConfigError('Router not configured')
    }

    const decision = await this.router.route(input, [...this.agents.values()], this.context)
    emit({ type: 'routing_decision', decision })

    const agentDef = this.agents.get(decision.agentId)
    if (!agentDef) {
      throw new AgentNotFoundError(decision.agentId)
    }

    emit({ type: 'agent_start', agentId: decision.agentId })
    const startTime = Date.now()

    const turnResult = await executeAgentTurn({
      agentDef,
      input,
      context: this.context,
      createRunContext: this.config.createRunContext,
      signal,
    })

    emit({ type: 'agent_end', agentId: decision.agentId, durationMs: Date.now() - startTime })

    return {
      pattern: 'router',
      output: turnResult,
      routing: { decision },
    }
  }

  // ─── 验证 ───

  private validateConfig(config: SwarmConfig): void {
    if (!config.name) {
      throw new SwarmConfigError('Swarm name is required')
    }

    if (!config.agents || config.agents.length === 0) {
      throw new SwarmConfigError('At least one agent is required')
    }

    if (!config.createRunContext) {
      throw new SwarmConfigError('createRunContext factory is required')
    }

    // 检查 ID 唯一性
    const ids = new Set<string>()
    for (const agent of config.agents) {
      if (ids.has(agent.id)) {
        throw new SwarmConfigError(`Duplicate agent ID: "${agent.id}"`)
      }
      ids.add(agent.id)
    }

    // 验证 handoff 目标有效性
    for (const agent of config.agents) {
      if (agent.handoffTargets) {
        for (const targetId of agent.handoffTargets) {
          if (!ids.has(targetId)) {
            throw new SwarmConfigError(
              `Agent "${agent.id}" references unknown handoff target "${targetId}"`,
            )
          }
        }
      }
    }

    // 验证 pipeline 配置
    if (config.pattern === 'sequential' && config.pipeline) {
      for (const agentId of config.pipeline) {
        if (!ids.has(agentId)) {
          throw new SwarmConfigError(`Pipeline references unknown agent "${agentId}"`)
        }
      }
    }

    // 验证 supervisor 配置
    if (config.pattern === 'hierarchical' && config.supervisorId) {
      if (!ids.has(config.supervisorId)) {
        throw new SwarmConfigError(`Supervisor "${config.supervisorId}" not found`)
      }
    }
  }
}

/** Swarm 运行结果 */
export interface SwarmRunResult {
  pattern: string
  output: SwarmTurnResult
  handoff?: HandoffResult
  pipeline?: { steps: PipelineStepResult[]; finalOutput: SwarmTurnResult }
  parallel?: ParallelResult
  hierarchical?: HierarchicalResult
  routing?: { decision: import('./types').RoutingDecision }
}

/** 工厂函数 */
export function createSwarm(config: SwarmConfig): Swarm {
  return new Swarm(config)
}
