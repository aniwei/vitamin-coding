import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentProfileRegistry } from '../src/agent-profile-registry'
import { BUILTIN_AGENT_PROFILES } from '../src/agent-profiles'
import type { AgentProfileRegistry, RegisteredAgentProfile, TaskType } from '../src/types'

function makeProfile(overrides: Partial<RegisteredAgentProfile> = {}): RegisteredAgentProfile {
  return {
    name: 'test-profile',
    taskTypes: ['code_generation'] as TaskType[],
    capabilities: ['coding'],
    systemPromptTemplate: 'Test prompt for {task_title}',
    preferredModelTier: 'standard',
    defaultMaxToolTurns: 25,
    ...overrides,
  }
}

describe('AgentProfileRegistry', () => {
  let registry: AgentProfileRegistry

  beforeEach(() => {
    registry = createAgentProfileRegistry()
  })

  describe('register + get', () => {
    it('stores and retrieves a profile by name', () => {
      const profile = makeProfile({ name: 'coder' })
      registry.register(profile)

      const result = registry.get('coder')
      expect(result).toBeDefined()
      expect(result!.name).toBe('coder')
      expect(result!.capabilities).toEqual(['coding'])
    })

    it('returns undefined for unregistered name', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })

    it('overwrites profile with same name', () => {
      registry.register(makeProfile({ name: 'coder', defaultMaxToolTurns: 10 }))
      registry.register(makeProfile({ name: 'coder', defaultMaxToolTurns: 50 }))

      expect(registry.get('coder')!.defaultMaxToolTurns).toBe(50)
    })
  })

  describe('resolve', () => {
    it('resolves by name', () => {
      registry.register(makeProfile({ name: 'coder' }))
      const result = registry.resolve({ name: 'coder' })
      expect(result!.name).toBe('coder')
    })

    it('resolves by category via taskType index', () => {
      registry.register(makeProfile({ name: 'coder', taskTypes: ['code_generation', 'code_modification'] }))
      const result = registry.resolve({ category: 'code_modification' })
      expect(result!.name).toBe('coder')
    })

    it('resolves by category via capability fallback', () => {
      registry.register(makeProfile({ name: 'debugger', taskTypes: ['debugging'], capabilities: ['debug', 'troubleshoot'] }))
      const result = registry.resolve({ category: 'troubleshoot' })
      expect(result!.name).toBe('debugger')
    })

    it('returns undefined when no match', () => {
      expect(registry.resolve({ category: 'nothing' })).toBeUndefined()
    })

    it('returns undefined for empty query', () => {
      expect(registry.resolve({})).toBeUndefined()
    })
  })

  describe('list', () => {
    it('returns empty array initially', () => {
      expect(registry.list()).toEqual([])
    })

    it('returns all registered profiles', () => {
      registry.register(makeProfile({ name: 'a' }))
      registry.register(makeProfile({ name: 'b' }))
      registry.register(makeProfile({ name: 'c' }))

      expect(registry.list()).toHaveLength(3)
      expect(registry.list().map(p => p.name).sort()).toEqual(['a', 'b', 'c'])
    })
  })
})

describe('BUILTIN_AGENT_PROFILES', () => {
  it('contains expected profiles', () => {
    const names = BUILTIN_AGENT_PROFILES.map(p => p.name)
    expect(names).toContain('coder')
    expect(names).toContain('tester')
    expect(names).toContain('debugger')
    expect(names).toContain('researcher')
    expect(names.length).toBeGreaterThanOrEqual(8)
  })

  it('all profiles have valid structure', () => {
    for (const profile of BUILTIN_AGENT_PROFILES) {
      expect(profile.name).toBeTruthy()
      expect(profile.taskTypes.length).toBeGreaterThan(0)
      expect(profile.systemPromptTemplate).toContain('{task_title}')
      expect(profile.defaultMaxToolTurns).toBeGreaterThan(0)
    }
  })

  it('can be registered on a fresh registry', () => {
    const registry = createAgentProfileRegistry()
    for (const p of BUILTIN_AGENT_PROFILES) {
      registry.register(p)
    }
    expect(registry.list()).toHaveLength(BUILTIN_AGENT_PROFILES.length)
  })
})
