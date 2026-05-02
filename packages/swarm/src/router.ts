import { createLogger } from '@vitamin/shared'

import type { RouterConfig, RoutingDecision, RouteRule, SwarmAgentDef, SwarmContext } from './types'
import { RoutingError } from './errors'

const logger = createLogger('@vitamin/swarm:router')

/** 路由器 — 根据策略选择目标 Agent */
export class SwarmRouter {
  private readonly config: RouterConfig
  private roundRobinIndex = 0

  constructor(config: RouterConfig) {
    this.config = config
  }

  async route(
    input: string,
    agents: SwarmAgentDef[],
    context: SwarmContext,
  ): Promise<RoutingDecision> {
    const { strategy } = this.config

    switch (strategy) {
      case 'rule':
        return this.routeByRule(input, agents)
      case 'round-robin':
        return this.routeRoundRobin(agents)
      case 'random':
        return this.routeRandom(agents)
      case 'custom':
        return this.routeCustom(input, agents, context)
      case 'llm':
        return this.routeByLlm(input, agents, context)
      default:
        throw new RoutingError(`Unknown routing strategy: ${strategy as string}`)
    }
  }

  /** 基于规则路由 */
  private routeByRule(input: string, agents: SwarmAgentDef[]): RoutingDecision {
    const rules = this.config.rules ?? []
    const lowerInput = input.toLowerCase()

    // 按优先级排序
    const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    for (const rule of sorted) {
      if (this.matchRule(rule, lowerInput)) {
        const agent = agents.find((a) => a.id === rule.agentId)
        if (agent) {
          return {
            agentId: rule.agentId,
            reason: `Matched rule for "${agent.name}"`,
            confidence: 1.0,
          }
        }
      }
    }

    return this.fallback(agents, 'No rule matched')
  }

  /** 轮转路由 */
  private routeRoundRobin(agents: SwarmAgentDef[]): RoutingDecision {
    const agent = agents[this.roundRobinIndex % agents.length] ?? agents[0]
    if (!agent) {
      return this.fallback(agents, 'No agents available for round-robin selection')
    }
    this.roundRobinIndex++

    return {
      agentId: agent.id,
      reason: `Round-robin selection (index ${this.roundRobinIndex - 1})`,
      confidence: 1.0,
    }
  }

  /** 随机路由 */
  private routeRandom(agents: SwarmAgentDef[]): RoutingDecision {
    const index = Math.floor(Math.random() * agents.length)
    const agent = agents[index] ?? agents[0]
    if (!agent) {
      return this.fallback(agents, 'No agents available for random selection')
    }

    return {
      agentId: agent.id,
      reason: 'Random selection',
      confidence: 1.0 / agents.length,
    }
  }

  /** 自定义路由 */
  private async routeCustom(
    input: string,
    agents: SwarmAgentDef[],
    context: SwarmContext,
  ): Promise<RoutingDecision> {
    if (!this.config.customRouter) {
      throw new RoutingError('Custom router function not provided')
    }

    return this.config.customRouter(input, agents, context)
  }

  /**
   * LLM 路由 — 用一个轻量级 LLM 调用根据 Agent 描述选择目标。
   * 需要宿主通过 config.customRouter 或具体的 LLM 调用来实现。
   * 此处提供默认实现骨架，实际 LLM 调用由宿主注入。
   */
  private async routeByLlm(
    input: string,
    agents: SwarmAgentDef[],
    context: SwarmContext,
  ): Promise<RoutingDecision> {
    // LLM 路由必须通过 customRouter 注入实际的 LLM 调用
    if (this.config.customRouter) {
      return this.config.customRouter(input, agents, context)
    }

    // Fallback: 简单的关键词匹配（生产环境应注入真实的 LLM 路由）
    logger.warn('LLM routing not configured, falling back to keyword matching')
    return this.routeByKeywordMatch(input, agents)
  }

  /** 简易关键词匹配 fallback */
  private routeByKeywordMatch(input: string, agents: SwarmAgentDef[]): RoutingDecision {
    const lowerInput = input.toLowerCase()
    let bestMatch: { agent: SwarmAgentDef; score: number } | null = null

    for (const agent of agents) {
      const descWords = agent.description.toLowerCase().split(/\s+/)
      const nameWords = agent.name.toLowerCase().split(/\s+/)
      const allWords = [...descWords, ...nameWords]

      let score = 0
      for (const word of allWords) {
        if (word.length > 3 && lowerInput.includes(word)) {
          score++
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { agent, score }
      }
    }

    if (bestMatch) {
      return {
        agentId: bestMatch.agent.id,
        reason: `Keyword match with "${bestMatch.agent.name}" (score: ${bestMatch.score})`,
        confidence: Math.min(bestMatch.score / 5, 1.0),
      }
    }

    return this.fallback(agents, 'No keyword match found')
  }

  /** Fallback 到默认 Agent */
  private fallback(agents: SwarmAgentDef[], reason: string): RoutingDecision {
    const fallbackId = this.config.fallbackAgentId ?? agents[0]?.id
    if (!fallbackId) {
      throw new RoutingError(`${reason} and no fallback agent configured`)
    }

    return {
      agentId: fallbackId,
      reason: `${reason} — using fallback agent`,
      confidence: 0,
    }
  }

  /** 匹配单条规则 */
  private matchRule(rule: RouteRule, input: string): boolean {
    if (rule.match instanceof RegExp) {
      return rule.match.test(input)
    }

    // 关键词数组 — 任一匹配
    return rule.match.some((keyword) => input.includes(keyword.toLowerCase()))
  }
}

/** 工厂函数 */
export function createRouter(config: RouterConfig): SwarmRouter {
  return new SwarmRouter(config)
}
