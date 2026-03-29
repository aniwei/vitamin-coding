// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Routing Strategy
// ═══════════════════════════════════════════════════════════
// 动态路由策略：按 capability / cost / load-balance 选择代理
// 参照 superpowers Model Tiering 模式

import type { AgentSpec } from './types'

// ═══ 数据模型 ═══

export type RoutingCriterion = 'capability' | 'cost' | 'load_balance' | 'model_tier'

export interface RoutingContext {
  prompt: string
  category?: string
  requiredCapabilities?: string[]
  preferredModel?: string
  complexity?: 'low' | 'medium' | 'high'
}

export interface RoutingScoredAgent {
  spec: AgentSpec
  score: number
  reason: string
}

export interface RoutingStrategy {
  name: string
  select(
    agents: AgentSpec[],
    context: RoutingContext,
  ): RoutingScoredAgent | undefined
}

// ═══ Capability 匹配策略 ═══

export function createCapabilityStrategy(): RoutingStrategy {
  return {
    name: 'capability',
    select(agents, context) {
      if (!context.requiredCapabilities || context.requiredCapabilities.length === 0) {
        return agents[0] ? { spec: agents[0], score: 0.5, reason: 'default (no capabilities required)' } : undefined
      }

      let best: RoutingScoredAgent | undefined

      for (const spec of agents) {
        const caps = spec.capabilities ?? []
        const matched = context.requiredCapabilities.filter(c => caps.includes(c))
        const score = matched.length / context.requiredCapabilities.length

        if (score > 0 && (!best || score > best.score)) {
          best = {
            spec,
            score,
            reason: `matched ${matched.length}/${context.requiredCapabilities.length} capabilities`,
          }
        }
      }

      return best
    },
  }
}

// ═══ Model Tier 策略 (superpowers 模式) ═══

const COMPLEXITY_TIER: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

export function createModelTierStrategy(): RoutingStrategy {
  return {
    name: 'model_tier',
    select(agents, context) {
      const targetTier = COMPLEXITY_TIER[context.complexity ?? 'medium'] ?? 2

      let best: RoutingScoredAgent | undefined

      for (const spec of agents) {
        // Infer tier from model name heuristic
        const tier = inferModelTier(spec.model)
        const distance = Math.abs(tier - targetTier)
        // Prefer exact match, then closest
        const score = 1 / (1 + distance)

        if (!best || score > best.score) {
          best = {
            spec,
            score,
            reason: `model tier ${tier} for complexity ${context.complexity ?? 'medium'}`,
          }
        }
      }

      return best
    },
  }
}

function inferModelTier(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('mini') || m.includes('flash') || m.includes('haiku')) return 1
  if (m.includes('opus') || m.includes('o1') || m.includes('o3')) return 3
  return 2 // default: standard tier
}

// ═══ 组合路由器 ═══

export interface CompositeRouter {
  addStrategy(strategy: RoutingStrategy): void
  removeStrategy(name: string): void
  route(agents: AgentSpec[], context: RoutingContext): RoutingScoredAgent | undefined
}

export function createCompositeRouter(): CompositeRouter {
  const strategies: RoutingStrategy[] = []

  return {
    addStrategy(strategy: RoutingStrategy) {
      strategies.push(strategy)
    },

    removeStrategy(name: string) {
      const idx = strategies.findIndex(s => s.name === name)
      if (idx >= 0) strategies.splice(idx, 1)
    },

    route(agents, context) {
      // Aggregate scores across all strategies
      const scores = new Map<string, { spec: AgentSpec; total: number; reasons: string[] }>()

      for (const agent of agents) {
        scores.set(agent.name, { spec: agent, total: 0, reasons: [] })
      }

      for (const strategy of strategies) {
        const result = strategy.select(agents, context)
        if (result) {
          const entry = scores.get(result.spec.name)
          if (entry) {
            entry.total += result.score
            entry.reasons.push(result.reason)
          }
        }
      }

      let best: { spec: AgentSpec; total: number; reasons: string[] } | undefined
      for (const entry of scores.values()) {
        if (!best || entry.total > best.total) {
          best = entry
        }
      }

      if (!best || best.total === 0) return undefined

      return {
        spec: best.spec,
        score: best.total,
        reason: best.reasons.join('; '),
      }
    },
  }
}
