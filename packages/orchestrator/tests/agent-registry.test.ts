// AgentRegistry 单元测试
import { describe, expect, it } from 'vitest'

import { AgentRegistry, createAgentRegistry } from '../src/registry/agent-registry'
import type { AgentRegistration } from '../src/types'

function createMockRegistration(overrides: Partial<AgentRegistration> = {}): AgentRegistration {
  return {
    name: 'test-agent',
    factory: () => ({
      prompt: async () => ({ messages: [], output: '', usage: { inputTokens: 0, outputTokens: 0 } }),
      abort: () => {},
      on: () => {},
    }),
    mode: 'subagent',
    metadata: {
      category: 'utility',
      cost: 'CHEAP',
      triggers: [],
      executionMode: 'sync',
    },
    modelPriority: ['test-model'],
    disableable: true,
    enabled: true,
    ...overrides,
  }
}

describe('AgentRegistry', () => {
  describe('#given an empty registry', () => {
    describe('#when registering an agent', () => {
      it('#then has() returns true for registered agent', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'alpha' }))

        expect(registry.has('alpha')).toBe(true)
        expect(registry.has('nonexistent')).toBe(false)
      })

      it('#then get() returns the registration', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'alpha' }))

        const reg = registry.get('alpha')
        expect(reg.name).toBe('alpha')
      })

      it('#then size reflects the count', () => {
        const registry = createAgentRegistry()
        expect(registry.size).toBe(0)

        registry.register(createMockRegistration({ name: 'a' }))
        registry.register(createMockRegistration({ name: 'b' }))
        expect(registry.size).toBe(2)
      })
    })

    describe('#when get() is called for non-existent agent', () => {
      it('#then throws AgentError', () => {
        const registry = createAgentRegistry()

        expect(() => registry.get('nonexistent')).toThrow('Agent "nonexistent" not found')
      })
    })
  })

  describe('#given a registry with multiple agents', () => {
    describe('#when filtering by mode', () => {
      it('#then getAvailable returns only matching enabled agents', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'primary-agent', mode: 'primary', enabled: true }))
        registry.register(createMockRegistration({ name: 'sub-agent', mode: 'subagent', enabled: true }))
        registry.register(createMockRegistration({ name: 'all-agent', mode: 'all', enabled: true }))
        registry.register(createMockRegistration({ name: 'disabled-agent', mode: 'subagent', enabled: false }))

        const subagents = registry.getAvailable('subagent')
        const names = subagents.map((a) => a.name)

        expect(names).toContain('sub-agent')
        expect(names).toContain('all-agent')
        expect(names).not.toContain('primary-agent')
        expect(names).not.toContain('disabled-agent')
      })
    })

    describe('#when setEnabled is called', () => {
      it('#then toggles agent availability', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'agent-x', enabled: true }))

        registry.setEnabled('agent-x', false)
        expect(registry.getAvailable()).not.toContainEqual(expect.objectContaining({ name: 'agent-x' }))

        registry.setEnabled('agent-x', true)
        expect(registry.getAvailable()).toContainEqual(expect.objectContaining({ name: 'agent-x' }))
      })

      it('#then non-disableable agent cannot be disabled', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'core-agent', disableable: false }))

        registry.setEnabled('core-agent', false)
        expect(registry.get('core-agent').enabled).toBe(true)
      })
    })

    describe('#when unregister is called', () => {
      it('#then removes the agent', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'agent-to-remove' }))

        expect(registry.has('agent-to-remove')).toBe(true)
        registry.unregister('agent-to-remove')
        expect(registry.has('agent-to-remove')).toBe(false)
      })
    })

    describe('#when clear is called', () => {
      it('#then removes all agents', () => {
        const registry = createAgentRegistry()
        registry.register(createMockRegistration({ name: 'a' }))
        registry.register(createMockRegistration({ name: 'b' }))

        registry.clear()
        expect(registry.size).toBe(0)
      })
    })
  })
})
