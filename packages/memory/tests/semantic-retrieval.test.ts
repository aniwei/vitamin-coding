import { describe, expect, it, vi } from 'vitest'
import {
  retrieveRelevantMemories,
  buildInjectionFromRetrieved,
  evaluateSemanticRetrieval,
} from '../src/semantic-retrieval'
import type { MemoryEntry, SemanticRetrievalConfig } from '../src/types'
import type { Message } from '@vitamin/ai'

const entries: MemoryEntry[] = [
  {
    name: 'user_role',
    description: 'User is a senior Go engineer',
    type: 'user',
    content: 'Deep Go expertise, new to React',
    filename: 'user_user_role.md',
  },
  {
    name: 'feedback_testing',
    description: 'Always use real database in tests',
    type: 'feedback',
    content: 'Integration tests must hit a real database',
    filename: 'feedback_testing.md',
  },
  {
    name: 'project_freeze',
    description: 'Merge freeze begins 2026-03-05',
    type: 'project',
    content: 'Merge freeze for mobile release cut',
    filename: 'project_freeze.md',
  },
  {
    name: 'reference_grafana',
    description: 'Oncall latency dashboard URL',
    type: 'reference',
    content: 'grafana.internal/d/api-latency',
    filename: 'reference_grafana.md',
  },
  {
    name: 'feedback_no_summaries',
    description: 'User prefers terse responses',
    type: 'feedback',
    content: 'No trailing summaries after each response',
    filename: 'feedback_no_summaries.md',
  },
  {
    name: 'project_auth',
    description: 'Auth middleware rewrite for compliance',
    type: 'project',
    content: 'Legal flagged session token storage',
    filename: 'project_auth.md',
  },
]

const messages: Message[] = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Can you help me write a database test?' }],
    timestamp: Date.now(),
  },
]

function makeConfig(overrides?: Partial<SemanticRetrievalConfig>): SemanticRetrievalConfig {
  return {
    enabled: true,
    maxResults: 3,
    summarize: vi.fn().mockResolvedValue('feedback_testing\nuser_role\nproject_freeze'),
    ...overrides,
  }
}

describe('retrieveRelevantMemories', () => {
  describe('#given enabled config with enough entries', () => {
    it('#then calls LLM and returns ranked entries', async () => {
      const config = makeConfig()
      const result = await retrieveRelevantMemories(entries, messages, config)

      expect(config.summarize).toHaveBeenCalledOnce()
      expect(result).toHaveLength(3)
      expect(result[0]!.name).toBe('feedback_testing')
      expect(result[1]!.name).toBe('user_role')
      expect(result[2]!.name).toBe('project_freeze')
    })
  })

  describe('#given entries <= maxResults', () => {
    it('#then returns all entries without calling LLM', async () => {
      const config = makeConfig({ maxResults: 10 })
      const result = await retrieveRelevantMemories(entries, messages, config)

      expect(config.summarize).not.toHaveBeenCalled()
      expect(result).toHaveLength(entries.length)
    })
  })

  describe('#given disabled config', () => {
    it('#then returns all entries without calling LLM', async () => {
      const config = makeConfig({ enabled: false })
      const result = await retrieveRelevantMemories(entries, messages, config)

      expect(config.summarize).not.toHaveBeenCalled()
      expect(result).toEqual(entries)
    })
  })

  describe('#given LLM returns NONE', () => {
    it('#then falls back to first N entries', async () => {
      const config = makeConfig({
        summarize: vi.fn().mockResolvedValue('NONE'),
      })
      const result = await retrieveRelevantMemories(entries, messages, config)

      expect(result).toHaveLength(3)
    })
  })

  describe('#given LLM throws', () => {
    it('#then falls back to first N entries', async () => {
      const config = makeConfig({
        summarize: vi.fn().mockRejectedValue(new Error('LLM error')),
      })
      const result = await retrieveRelevantMemories(entries, messages, config)

      expect(result).toHaveLength(3)
    })
  })

  describe('#given empty entries', () => {
    it('#then returns empty array', async () => {
      const config = makeConfig()
      const result = await retrieveRelevantMemories([], messages, config)

      expect(result).toHaveLength(0)
      expect(config.summarize).not.toHaveBeenCalled()
    })
  })

  describe('#given expected names', () => {
    it('#then still returns ranked entries while computing quality trace', async () => {
      const config = makeConfig()
      const result = await retrieveRelevantMemories(entries, messages, config, {
        expectedNames: ['feedback_testing', 'project_auth'],
      })

      expect(result.map((entry) => entry.name)).toEqual([
        'feedback_testing',
        'user_role',
        'project_freeze',
      ])
    })
  })
})

describe('evaluateSemanticRetrieval', () => {
  it('#then reports precision, recall, missing and unexpected entries', () => {
    const quality = evaluateSemanticRetrieval(
      [entries[1]!, entries[0]!, entries[2]!],
      ['feedback_testing', 'project_auth'],
      3,
    )

    expect(quality).toEqual({
      requested: 3,
      returned: 3,
      expected: 2,
      relevant: 1,
      precision: 1 / 3,
      recall: 1 / 2,
      missing: ['project_auth'],
      unexpected: ['user_role', 'project_freeze'],
    })
  })
})

describe('buildInjectionFromRetrieved', () => {
  describe('#given entries', () => {
    it('#then builds formatted injection text', () => {
      const selected = entries.slice(0, 2)
      const injection = buildInjectionFromRetrieved(selected)

      expect(injection).toContain('<agent_memory>')
      expect(injection).toContain('</agent_memory>')
      expect(injection).toContain('[user] user_role')
      expect(injection).toContain('[feedback] feedback_testing')
      expect(injection).toContain('Deep Go expertise')
    })
  })

  describe('#given empty entries', () => {
    it('#then returns empty string', () => {
      expect(buildInjectionFromRetrieved([])).toBe('')
    })
  })
})
