import { describe, it, expect } from 'vitest'
import { createSwarm, Swarm, type SwarmRunResult } from '../src/swarm'
import { SwarmConfigError, AgentNotFoundError } from '../src/errors'
import type { SwarmAgentDef, SwarmConfig, SwarmContext, SwarmRunContextFactory } from '../src/types'
import type { AgentRunContext } from '@x-mars/agent'
import type { Model } from '@x-mars/ai'

// ─── 测试用 fixtures ───

const testModel: Model = {
  id: 'test-model',
  name: 'Test Model',
  api: 'anthropic' as const,
  provider: 'anthropic',
  contextWindow: 100_000,
  maxOutputTokens: 4096,
  cost: { inputPer1k: 0.003, outputPer1k: 0.015 },
  capabilities: {
    reasoning: false,
    vision: false,
    inputTypes: ['text'],
  },
}

function makeAgentDef(overrides: Partial<SwarmAgentDef> & { id: string }): SwarmAgentDef {
  return {
    name: overrides.name ?? `Agent ${overrides.id}`,
    description: overrides.description ?? `Test agent ${overrides.id}`,
    systemPrompt: overrides.systemPrompt ?? 'You are a test agent.',
    ...overrides,
  }
}

/**
 * createRunContext 工厂 — 返回符合 AgentRunContext 接口的基础上下文。
 * 注意：executeAgentTurn 内部使用 new Agent()（无 stream 配置），
 * 因此实际 LLM 调用会失败。此工厂仅用于验证编排逻辑（事件分发、路由等），
 * 不验证 Agent 的实际执行结果。
 */
function createTestRunContextFactory(_responseText = 'Test response'): SwarmRunContextFactory {
  return (
    agentDef: SwarmAgentDef,
    _context: SwarmContext,
    _signal: AbortSignal,
  ): AgentRunContext => {
    return {
      model: agentDef.model ?? testModel,
      systemPrompt: agentDef.systemPrompt,
      messages: [],
      tools: agentDef.tools ?? [],
    }
  }
}

// ─── 测试 ───

describe('Swarm', () => {
  describe('configuration validation', () => {
    it('throws on empty name', () => {
      expect(() =>
        createSwarm({
          name: '',
          agents: [makeAgentDef({ id: 'a' })],
          defaultModel: testModel,
          pattern: 'handoff',
          createRunContext: createTestRunContextFactory(),
        }),
      ).toThrow(SwarmConfigError)
    })

    it('throws on empty agents', () => {
      expect(() =>
        createSwarm({
          name: 'test',
          agents: [],
          defaultModel: testModel,
          pattern: 'handoff',
          createRunContext: createTestRunContextFactory(),
        }),
      ).toThrow(SwarmConfigError)
    })

    it('throws on duplicate agent IDs', () => {
      expect(() =>
        createSwarm({
          name: 'test',
          agents: [makeAgentDef({ id: 'a' }), makeAgentDef({ id: 'a' })],
          defaultModel: testModel,
          pattern: 'handoff',
          createRunContext: createTestRunContextFactory(),
        }),
      ).toThrow(SwarmConfigError)
    })

    it('throws on invalid handoff target', () => {
      expect(() =>
        createSwarm({
          name: 'test',
          agents: [makeAgentDef({ id: 'a', handoffTargets: ['nonexistent'] })],
          defaultModel: testModel,
          pattern: 'handoff',
          createRunContext: createTestRunContextFactory(),
        }),
      ).toThrow(SwarmConfigError)
    })

    it('throws on invalid pipeline agent', () => {
      expect(() =>
        createSwarm({
          name: 'test',
          agents: [makeAgentDef({ id: 'a' })],
          defaultModel: testModel,
          pattern: 'sequential',
          pipeline: ['a', 'nonexistent'],
          createRunContext: createTestRunContextFactory(),
        }),
      ).toThrow(SwarmConfigError)
    })

    it('creates successfully with valid config', () => {
      const swarm = createSwarm({
        name: 'test',
        agents: [makeAgentDef({ id: 'a' }), makeAgentDef({ id: 'b', handoffTargets: ['a'] })],
        defaultModel: testModel,
        pattern: 'handoff',
        createRunContext: createTestRunContextFactory(),
      })

      expect(swarm).toBeInstanceOf(Swarm)
      expect(swarm.getAgents()).toHaveLength(2)
      expect(swarm.getAgent('a')).toBeDefined()
      expect(swarm.getAgent('nonexistent')).toBeUndefined()
    })
  })

  describe('context management', () => {
    it('creates fresh context on construction', () => {
      const swarm = createSwarm({
        name: 'test',
        agents: [makeAgentDef({ id: 'a' })],
        defaultModel: testModel,
        pattern: 'handoff',
        createRunContext: createTestRunContextFactory(),
      })

      const ctx = swarm.getContext()
      expect(ctx.variables.size).toBe(0)
      expect(ctx.activeAgentId).toBeNull()
      expect(ctx.handoffHistory).toHaveLength(0)
      expect(ctx.messages).toHaveLength(0)
    })

    it('resets context', () => {
      const swarm = createSwarm({
        name: 'test',
        agents: [makeAgentDef({ id: 'a' })],
        defaultModel: testModel,
        pattern: 'handoff',
        createRunContext: createTestRunContextFactory(),
      })

      const ctx = swarm.getContext()
      ctx.variables.set('key', 'value')
      ctx.metadata['test'] = true

      swarm.resetContext()
      const newCtx = swarm.getContext()
      expect(newCtx.variables.size).toBe(0)
    })
  })

  describe('event emission', () => {
    it('emits swarm_start and swarm_end events', async () => {
      const events: string[] = []

      const swarm = createSwarm({
        name: 'test',
        agents: [makeAgentDef({ id: 'a' })],
        defaultModel: testModel,
        pattern: 'router',
        router: {
          strategy: 'round-robin',
        },
        createRunContext: createTestRunContextFactory(),
      })

      swarm.on('swarm_start', () => events.push('swarm_start'))
      swarm.on('swarm_end', () => events.push('swarm_end'))
      swarm.on('agent_start', () => events.push('agent_start'))
      swarm.on('agent_end', () => events.push('agent_end'))

      // executeAgentTurn 内部使用 new Agent()（无 stream config），Agent 执行时抛出。
      // swarm_start / agent_start 在 executeAgentTurn 之前触发；
      // swarm_end 在 run() 的 catch 块里触发（即使出错仍会触发）；
      // agent_end 仅在 executeAgentTurn 成功后触发，此处不触发。
      await expect(swarm.run('test input')).rejects.toThrow()

      expect(events).toContain('swarm_start')
      expect(events).toContain('swarm_end')
      expect(events).toContain('agent_start')
    })
  })
})
