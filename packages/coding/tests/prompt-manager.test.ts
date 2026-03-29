import { describe, expect, it } from 'vitest'
import {
  PromptManager,
  LEAD_ROLE_INSTRUCTIONS,
  SUBAGENT_ROLE_INSTRUCTIONS,
} from '../src/lead/prompt-manager'
import type { LoadedResources } from '../src/resources/resource-manager'

// 辅助：构建最小 LoadedResources
function makeResources(overrides: Partial<LoadedResources> = {}): LoadedResources {
  return {
    agentInstructions: '',
    memories: new Map(),
    promptTemplates: [],
    diagnostics: [],
    ...overrides,
  }
}

function createManager(resources?: LoadedResources | null): PromptManager {
  return new PromptManager({ resources: resources ?? null })
}

describe('PromptManager.buildLeadPrompt', () => {
  it('returns empty string when no inputs', () => {
    const pm = createManager()
    expect(pm.buildLeadPrompt()).toBe('')
  })

  it('includes customSystemPrompt only', () => {
    const pm = createManager()
    const result = pm.buildLeadPrompt({ customSystemPrompt: 'You are helpful.' })
    expect(result).toBe('You are helpful.')
  })

  it('includes agentInstructions from resources', () => {
    const resources = makeResources({ agentInstructions: 'Project: use TS.' })
    const pm = createManager(resources)
    const result = pm.buildLeadPrompt()
    expect(result).toBe('Project: use TS.')
  })

  it('concatenates all sections in order', () => {
    const resources = makeResources({ agentInstructions: 'AGENTS.md notes' })
    const pm = createManager(resources)

    const result = pm.buildLeadPrompt({
      customSystemPrompt: 'Custom top',
      roleInstructions: 'You are the lead agent.',
    })

    const parts = result.split('\n\n')
    expect(parts).toEqual([
      'Custom top',
      'AGENTS.md notes',
      'You are the lead agent.',
    ])
  })

  it('skips empty sections', () => {
    const resources = makeResources({ agentInstructions: '' })
    const pm = createManager(resources)

    const result = pm.buildLeadPrompt({
      customSystemPrompt: 'Custom',
    })

    const parts = result.split('\n\n')
    expect(parts).toEqual(['Custom'])
  })

  it('accepts null resources gracefully', () => {
    const pm = createManager(null)
    const result = pm.buildLeadPrompt()
    expect(result).toBe('')
  })

  it('options.resources overrides instance resources', () => {
    const instanceRes = makeResources({ agentInstructions: 'from instance' })
    const overrideRes = makeResources({ agentInstructions: 'from override' })
    const pm = createManager(instanceRes)

    const result = pm.buildLeadPrompt({ resources: overrideRes })
    expect(result).toBe('from override')
  })

  it('includes agent and tool catalogs when provided', () => {
    const pm = createManager()
    const result = pm.buildLeadPrompt({
      agentCatalog: [{ name: 'reviewer', description: 'Reviews code', capabilities: ['code', 'review'] }],
      toolCatalog: [
        { name: 'read_file', description: 'Read a file', source: 'builtin', category: 'fs' },
      ],
    })

    expect(result).toContain('## Available Specialist Agents')
    expect(result).toContain('reviewer: Reviews code.')
    expect(result).toContain('## Tooling Surface')
    expect(result).toContain('read_file [fs]: Read a file')
  })
})

describe('LEAD_ROLE_INSTRUCTIONS', () => {
  it('contains planning, delegation, review, and status sections', () => {
    expect(LEAD_ROLE_INSTRUCTIONS).toContain('### Phase 2: Plan')
    expect(LEAD_ROLE_INSTRUCTIONS).toContain('### Phase 3: Execute Or Delegate')
    expect(LEAD_ROLE_INSTRUCTIONS).toContain('### Phase 4: Verify')
    expect(LEAD_ROLE_INSTRUCTIONS).toContain('### Status Reporting')
  })

  it('is injected into lead prompt via roleInstructions', () => {
    const pm = createManager()
    const result = pm.buildLeadPrompt({ roleInstructions: LEAD_ROLE_INSTRUCTIONS })
    expect(result).toContain('The plan is a contract')
    expect(result).toContain('spec compliance')
  })
})

describe('PromptManager.buildSubagentPrompt', () => {
  it('returns subagent role by default', () => {
    const pm = createManager()
    const result = pm.buildSubagentPrompt({})
    expect(result).toContain('## Role: Specialist Subagent')
  })

  it('uses specSystemPrompt', () => {
    const pm = createManager()
    const result = pm.buildSubagentPrompt({ specSystemPrompt: 'You review code.' })
    expect(result).toContain('You review code.')
    expect(result).toContain('Specialist Subagent')
  })

  it('includes agentInstructions from instance resources', () => {
    const resources = makeResources({ agentInstructions: 'AGENTS.md' })
    const pm = createManager(resources)

    const result = pm.buildSubagentPrompt({
      specSystemPrompt: 'Reviewer',
    })

    expect(result).toContain('Reviewer')
    expect(result).toContain('AGENTS.md')
  })

  it('includes tool catalog', () => {
    const pm = createManager()
    const result = pm.buildSubagentPrompt({
      toolCatalog: [{ name: 'bash', description: 'Run shell commands', source: 'builtin', category: 'shell' }],
    })

    expect(result).toContain(SUBAGENT_ROLE_INSTRUCTIONS)
    expect(result).toContain('bash [shell]: Run shell commands')
  })
})

describe('PromptManager.setResources', () => {
  it('updates resources used by subsequent builds', () => {
    const pm = createManager()
    expect(pm.buildLeadPrompt()).toBe('')

    pm.setResources(makeResources({ agentInstructions: 'New instructions' }))
    expect(pm.buildLeadPrompt()).toBe('New instructions')
  })
})
