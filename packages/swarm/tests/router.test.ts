import { describe, it, expect } from 'vitest'
import { SwarmRouter, createRouter } from '../src/router'
import { RoutingError } from '../src/errors'
import { createSwarmContext } from '../src/context'
import type { SwarmAgentDef, RouterConfig } from '../src/types'

function makeAgent(id: string, opts?: Partial<SwarmAgentDef>): SwarmAgentDef {
  return {
    id,
    name: `Agent ${id}`,
    description: `Test agent ${id}`,
    systemPrompt: 'You are a test agent.',
    ...opts,
  }
}

const agents: SwarmAgentDef[] = [
  makeAgent('coder', { description: 'Writes and reviews code' }),
  makeAgent('researcher', { description: 'Searches and analyzes information' }),
  makeAgent('writer', { description: 'Writes documentation and articles' }),
]

describe('SwarmRouter', () => {
  describe('rule-based routing', () => {
    it('matches regex rules', async () => {
      const router = createRouter({
        strategy: 'rule',
        rules: [
          { match: /code|implement|fix/i, agentId: 'coder' },
          { match: /search|research|find/i, agentId: 'researcher' },
          { match: /write|document|article/i, agentId: 'writer' },
        ],
      })

      const ctx = createSwarmContext()

      const r1 = await router.route('Please fix this bug', agents, ctx)
      expect(r1.agentId).toBe('coder')

      const r2 = await router.route('Research latest papers', agents, ctx)
      expect(r2.agentId).toBe('researcher')

      const r3 = await router.route('Write documentation', agents, ctx)
      expect(r3.agentId).toBe('writer')
    })

    it('matches keyword array rules', async () => {
      const router = createRouter({
        strategy: 'rule',
        rules: [{ match: ['code', 'implement', 'fix'], agentId: 'coder' }],
      })

      const ctx = createSwarmContext()
      const result = await router.route('please implement this feature', agents, ctx)
      expect(result.agentId).toBe('coder')
    })

    it('respects priority ordering', async () => {
      const router = createRouter({
        strategy: 'rule',
        rules: [
          { match: /write/, agentId: 'writer', priority: 1 },
          { match: /write/, agentId: 'coder', priority: 10 },
        ],
      })

      const ctx = createSwarmContext()
      const result = await router.route('write some code', agents, ctx)
      expect(result.agentId).toBe('coder')
    })

    it('falls back when no rule matches', async () => {
      const router = createRouter({
        strategy: 'rule',
        rules: [],
        fallbackAgentId: 'coder',
      })

      const ctx = createSwarmContext()
      const result = await router.route('random input', agents, ctx)
      expect(result.agentId).toBe('coder')
      expect(result.confidence).toBe(0)
    })
  })

  describe('round-robin routing', () => {
    it('cycles through agents', async () => {
      const router = createRouter({ strategy: 'round-robin' })
      const ctx = createSwarmContext()

      const r1 = await router.route('q1', agents, ctx)
      const r2 = await router.route('q2', agents, ctx)
      const r3 = await router.route('q3', agents, ctx)
      const r4 = await router.route('q4', agents, ctx)

      expect(r1.agentId).toBe('coder')
      expect(r2.agentId).toBe('researcher')
      expect(r3.agentId).toBe('writer')
      expect(r4.agentId).toBe('coder') // wraps around
    })
  })

  describe('random routing', () => {
    it('returns a valid agent', async () => {
      const router = createRouter({ strategy: 'random' })
      const ctx = createSwarmContext()

      const result = await router.route('test', agents, ctx)
      const agentIds = agents.map((a) => a.id)
      expect(agentIds).toContain(result.agentId)
    })
  })

  describe('custom routing', () => {
    it('uses custom router function', async () => {
      const router = createRouter({
        strategy: 'custom',
        customRouter: async (input, _agents, _ctx) => ({
          agentId: input.includes('code') ? 'coder' : 'writer',
          reason: 'Custom logic',
          confidence: 0.9,
        }),
      })

      const ctx = createSwarmContext()
      const r1 = await router.route('write some code', agents, ctx)
      expect(r1.agentId).toBe('coder')

      const r2 = await router.route('hello world', agents, ctx)
      expect(r2.agentId).toBe('writer')
    })

    it('throws when custom function is missing', async () => {
      const router = createRouter({ strategy: 'custom' })
      const ctx = createSwarmContext()

      await expect(router.route('test', agents, ctx)).rejects.toThrow(RoutingError)
    })
  })

  describe('LLM routing fallback', () => {
    it('falls back to keyword matching when no custom router', async () => {
      const router = createRouter({ strategy: 'llm' })
      const ctx = createSwarmContext()

      // "code" should match coder's description
      const result = await router.route('help me with code review', agents, ctx)
      expect(result.agentId).toBeDefined()
    })

    it('uses custom router for LLM when provided', async () => {
      const router = createRouter({
        strategy: 'llm',
        customRouter: async () => ({
          agentId: 'researcher',
          reason: 'LLM decided',
          confidence: 0.95,
        }),
      })

      const ctx = createSwarmContext()
      const result = await router.route('anything', agents, ctx)
      expect(result.agentId).toBe('researcher')
    })
  })
})
