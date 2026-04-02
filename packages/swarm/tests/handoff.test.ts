import { describe, it, expect } from 'vitest'
import { createHandoffTool, validateHandoff } from '../src/handoff'
import type { SwarmAgentDef, HandoffRequest } from '../src/types'

function makeAgent(id: string, opts?: Partial<SwarmAgentDef>): SwarmAgentDef {
  return {
    id,
    name: `Agent ${id}`,
    description: `Test agent ${id}`,
    systemPrompt: 'You are a test agent.',
    ...opts,
  }
}

describe('handoff', () => {
  describe('createHandoffTool', () => {
    it('creates a tool with correct name and description', () => {
      const targets = [makeAgent('b'), makeAgent('c')]
      let capturedRequest: HandoffRequest | null = null

      const tool = createHandoffTool('a', targets, (r) => { capturedRequest = r })

      expect(tool.name).toBe('handoff_to_agent')
      expect(tool.description).toContain('b')
      expect(tool.description).toContain('c')
    })

    it('calls onHandoff callback with valid target', async () => {
      const targets = [makeAgent('b'), makeAgent('c')]
      let capturedRequest: HandoffRequest | null = null

      const tool = createHandoffTool('a', targets, (r) => { capturedRequest = r })

      const result = await tool.execute({
        id: 'tool-1',
        params: {
          target_agent_id: 'b',
          reason: 'Need code review',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBeFalsy()
      expect(capturedRequest).not.toBeNull()
      expect(capturedRequest!.from).toBe('a')
      expect(capturedRequest!.to).toBe('b')
      expect(capturedRequest!.reason).toContain('Need code review')
    })

    it('returns error for invalid target', async () => {
      const targets = [makeAgent('b')]
      let capturedRequest: HandoffRequest | null = null

      const tool = createHandoffTool('a', targets, (r) => { capturedRequest = r })

      const result = await tool.execute({
        id: 'tool-1',
        params: {
          target_agent_id: 'nonexistent',
          reason: 'test',
        },
        signal: new AbortController().signal,
      })

      expect(result.isError).toBe(true)
      expect(capturedRequest).toBeNull()
    })

    it('includes summary in handoff reason when provided', async () => {
      const targets = [makeAgent('b')]
      let capturedRequest: HandoffRequest | null = null

      const tool = createHandoffTool('a', targets, (r) => { capturedRequest = r })

      await tool.execute({
        id: 'tool-1',
        params: {
          target_agent_id: 'b',
          reason: 'Handoff reason',
          summary: 'Work done so far',
        },
        signal: new AbortController().signal,
      })

      expect(capturedRequest!.reason).toContain('Handoff reason')
      expect(capturedRequest!.reason).toContain('Work done so far')
    })
  })

  describe('validateHandoff', () => {
    it('validates valid handoff', () => {
      const agents = new Map<string, SwarmAgentDef>([
        ['a', makeAgent('a')],
        ['b', makeAgent('b')],
      ])

      const result = validateHandoff({ from: 'a', to: 'b', reason: 'test' }, agents)
      expect(result.valid).toBe(true)
    })

    it('rejects unknown source', () => {
      const agents = new Map<string, SwarmAgentDef>([
        ['b', makeAgent('b')],
      ])

      const result = validateHandoff({ from: 'a', to: 'b', reason: 'test' }, agents)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('a')
    })

    it('rejects unknown target', () => {
      const agents = new Map<string, SwarmAgentDef>([
        ['a', makeAgent('a')],
      ])

      const result = validateHandoff({ from: 'a', to: 'b', reason: 'test' }, agents)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('b')
    })

    it('rejects disallowed handoff target', () => {
      const agents = new Map<string, SwarmAgentDef>([
        ['a', makeAgent('a', { handoffTargets: ['c'] })],
        ['b', makeAgent('b')],
        ['c', makeAgent('c')],
      ])

      const result = validateHandoff({ from: 'a', to: 'b', reason: 'test' }, agents)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not allowed')
    })

    it('allows handoff when handoffTargets is empty (unrestricted)', () => {
      const agents = new Map<string, SwarmAgentDef>([
        ['a', makeAgent('a', { handoffTargets: [] })],
        ['b', makeAgent('b')],
      ])

      const result = validateHandoff({ from: 'a', to: 'b', reason: 'test' }, agents)
      expect(result.valid).toBe(true)
    })
  })
})
