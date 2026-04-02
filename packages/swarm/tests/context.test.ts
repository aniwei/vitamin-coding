import { describe, it, expect } from 'vitest'
import { createSwarmContext, buildCallGraph } from '../src/context'
import type { SwarmAgentDef } from '../src/types'

describe('SwarmContext', () => {
  describe('createSwarmContext', () => {
    it('creates empty context by default', () => {
      const ctx = createSwarmContext()

      expect(ctx.variables.size).toBe(0)
      expect(ctx.activeAgentId).toBeNull()
      expect(ctx.handoffHistory).toHaveLength(0)
      expect(ctx.messages).toHaveLength(0)
      expect(Object.keys(ctx.metadata)).toHaveLength(0)
    })

    it('initializes with provided variables', () => {
      const ctx = createSwarmContext({
        projectName: 'vitamin',
        maxRetries: 3,
      })

      expect(ctx.variables.get('projectName')).toBe('vitamin')
      expect(ctx.variables.get('maxRetries')).toBe(3)
      expect(ctx.variables.size).toBe(2)
    })
  })

  describe('buildCallGraph', () => {
    const agents: SwarmAgentDef[] = [
      {
        id: 'architect',
        name: 'Architect',
        description: 'System architect',
        systemPrompt: '',
        handoffTargets: ['coder', 'reviewer'],
      },
      {
        id: 'coder',
        name: 'Coder',
        description: 'Implementation specialist',
        systemPrompt: '',
        handoffTargets: ['reviewer'],
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        description: 'Code reviewer',
        systemPrompt: '',
      },
    ]

    it('renders agent list with active marker', () => {
      const ctx = createSwarmContext()
      const graph = buildCallGraph(agents, 'coder', ctx)

      expect(graph).toContain('architect: Architect')
      expect(graph).toContain('coder: Coder (active)')
      expect(graph).toContain('reviewer: Reviewer')
    })

    it('renders handoff targets', () => {
      const ctx = createSwarmContext()
      const graph = buildCallGraph(agents, null, ctx)

      expect(graph).toContain('handoff targets: [coder, reviewer]')
      expect(graph).toContain('handoff targets: [reviewer]')
    })

    it('renders handoff history', () => {
      const ctx = createSwarmContext()
      ctx.handoffHistory.push(
        { from: 'architect', to: 'coder', reason: 'Implement feature X' },
        { from: 'coder', to: 'reviewer', reason: 'Ready for review' },
      )

      const graph = buildCallGraph(agents, 'reviewer', ctx)

      expect(graph).toContain('Handoff History')
      expect(graph).toContain('architect → coder: Implement feature X')
      expect(graph).toContain('coder → reviewer: Ready for review')
    })
  })
})
