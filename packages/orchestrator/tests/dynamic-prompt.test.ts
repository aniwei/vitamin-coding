// Dynamic Prompt Builder 单元测试
import { describe, expect, it } from 'vitest'

import {
  buildDelegationTable,
  buildKeyTriggers,
  buildToolSelectionTable,
  buildDynamicPrompt,
} from '../src/dynamic-prompt/prompt-builder'
import { buildAgentSummary, buildAllAgentSummaries } from '../src/dynamic-prompt/agent-summaries'
import type { AgentRegistration } from '../src/types'

function createMockRegistration(name: string, overrides: Partial<AgentRegistration> = {}): AgentRegistration {
  return {
    name,
    factory: () => ({
      prompt: async () => ({ messages: [], output: '', usage: { inputTokens: 0, outputTokens: 0 } }),
      abort: () => {},
      on: () => {},
    }),
    mode: 'subagent',
    metadata: {
      category: 'utility',
      cost: 'CHEAP',
      triggers: [{ domain: 'test', trigger: 'test-pattern' }],
      useWhen: ['test scenario'],
      executionMode: 'sync',
    },
    modelPriority: ['test-model'],
    disableable: true,
    enabled: true,
    ...overrides,
  }
}

describe('buildDelegationTable', () => {
  describe('#given enabled registrations', () => {
    describe('#when building delegation table', () => {
      it('#then generates markdown table with agent info', () => {
        const registrations = [
          createMockRegistration('explore', {
            metadata: {
              category: 'exploration',
              cost: 'CHEAP',
              triggers: [],
              useWhen: ['codebase search'],
              executionMode: 'both',
            },
          }),
        ]

        const table = buildDelegationTable(registrations)

        expect(table).toContain('## Delegation Table')
        expect(table).toContain('explore')
        expect(table).toContain('exploration')
        expect(table).toContain('CHEAP')
        expect(table).toContain('codebase search')
      })
    })

    describe('#when disabled agents exist', () => {
      it('#then excludes disabled agents', () => {
        const registrations = [
          createMockRegistration('enabled-agent'),
          createMockRegistration('disabled-agent', { enabled: false }),
        ]

        const table = buildDelegationTable(registrations)

        expect(table).toContain('enabled-agent')
        expect(table).not.toContain('disabled-agent')
      })
    })
  })

  describe('#given empty registrations', () => {
    describe('#when building delegation table', () => {
      it('#then returns empty string', () => {
        expect(buildDelegationTable([])).toBe('')
      })
    })
  })
})

describe('buildKeyTriggers', () => {
  describe('#given registrations with triggers', () => {
    describe('#when building key triggers', () => {
      it('#then lists trigger patterns with agent mappings', () => {
        const registrations = [
          createMockRegistration('hephaestus', {
            metadata: {
              category: 'specialist',
              cost: 'EXPENSIVE',
              triggers: [{ domain: 'code', trigger: 'refactor|redesign' }],
              executionMode: 'both',
            },
          }),
        ]

        const triggers = buildKeyTriggers(registrations)

        expect(triggers).toContain('## Key Triggers')
        expect(triggers).toContain('refactor|redesign')
        expect(triggers).toContain('hephaestus')
        expect(triggers).toContain('code')
      })
    })
  })
})

describe('buildToolSelectionTable', () => {
  describe('#given tool list', () => {
    describe('#when building tool selection table', () => {
      it('#then generates table with tool info', () => {
        const tools = [
          { name: 'read', description: 'Read file contents' },
          { name: 'grep', description: 'Search with regex' },
        ]

        const table = buildToolSelectionTable(tools)

        expect(table).toContain('## Tool Selection')
        expect(table).toContain('read')
        expect(table).toContain('grep')
        expect(table).toContain('all agents')
        expect(table).toContain('explore, oracle')
      })
    })

    describe('#when tool description is very long', () => {
      it('#then truncates to 60 chars', () => {
        const tools = [
          { name: 'test', description: 'A'.repeat(100) },
        ]

        const table = buildToolSelectionTable(tools)
        expect(table).toContain('...')
      })
    })
  })
})

describe('buildDynamicPrompt', () => {
  describe('#given registrations and tools', () => {
    describe('#when building full dynamic prompt', () => {
      it('#then contains all three sections', () => {
        const registrations = [createMockRegistration('test-agent')]
        const tools = [{ name: 'read', description: 'Read file' }]

        const prompt = buildDynamicPrompt({ registrations, tools })

        expect(prompt).toContain('# Agent Delegation Reference')
        expect(prompt).toContain('## Delegation Table')
        expect(prompt).toContain('## Key Triggers')
        expect(prompt).toContain('## Tool Selection')
      })
    })
  })
})

describe('buildAgentSummary', () => {
  describe('#given a registration with full metadata', () => {
    describe('#when building summary', () => {
      it('#then includes all metadata fields', () => {
        const reg = createMockRegistration('explore', {
          metadata: {
            category: 'exploration',
            cost: 'CHEAP',
            triggers: [],
            useWhen: ['codebase search'],
            avoidWhen: ['write tasks'],
            executionMode: 'both',
          },
          toolRestrictions: { allowed: ['read', 'grep'] },
        })

        const summary = buildAgentSummary(reg)

        expect(summary).toContain('**explore**')
        expect(summary).toContain('exploration')
        expect(summary).toContain('CHEAP')
        expect(summary).toContain('codebase search')
        expect(summary).toContain('write tasks')
        expect(summary).toContain('read, grep')
        expect(summary).toContain('both')
      })
    })
  })
})

describe('buildAllAgentSummaries', () => {
  describe('#given mixed enabled/disabled agents', () => {
    describe('#when building all summaries', () => {
      it('#then only includes enabled agents', () => {
        const registrations = [
          createMockRegistration('active-agent'),
          createMockRegistration('inactive-agent', { enabled: false }),
        ]

        const summaries = buildAllAgentSummaries(registrations)

        expect(summaries).toContain('active-agent')
        expect(summaries).not.toContain('inactive-agent')
      })
    })
  })
})
