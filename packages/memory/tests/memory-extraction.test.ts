import { describe, expect, it, vi } from 'vitest'
import { extractAndSave, extractMemories, parseExtractionResponse } from '../src/memory-extraction'
import type { MemoryEntry, MemoryExtractionConfig } from '../src/types'
import type { Message } from '@x-mars/ai'

const sampleResponse = `NAME: user_role
TYPE: user
DESCRIPTION: User is a senior full-stack engineer
CONTENT:
The user has 10 years of experience in full-stack development, primarily Go and TypeScript.
END

NAME: feedback_testing
TYPE: feedback
DESCRIPTION: Always use real databases in integration tests
CONTENT:
Integration tests must hit a real database, not mocks.
**Why:** Prior incident where mock/prod divergence masked a broken migration.
**How to apply:** When writing test files that touch DB logic, always use the test database helper.
END

NAME: project_deadline
TYPE: project
DESCRIPTION: v2 release deadline is 2026-06-15
CONTENT:
Ship v2 by 2026-06-15.
**Why:** Customer commitment made by product team.
**How to apply:** Prioritize v2 features over tech debt cleanup until release.
END`

describe('parseExtractionResponse', () => {
  describe('#given valid multi-entry response', () => {
    it('#then parses all entries with correct fields', () => {
      const entries = parseExtractionResponse(sampleResponse)

      expect(entries).toHaveLength(3)

      expect(entries[0]!.name).toBe('user_role')
      expect(entries[0]!.type).toBe('user')
      expect(entries[0]!.content).toContain('10 years of experience')
      expect(entries[0]!.filename).toBe('user_user_role.md')

      expect(entries[1]!.name).toBe('feedback_testing')
      expect(entries[1]!.type).toBe('feedback')
      expect(entries[1]!.content).toContain('**Why:**')

      expect(entries[2]!.name).toBe('project_deadline')
      expect(entries[2]!.type).toBe('project')
    })
  })

  describe('#given NONE response', () => {
    it('#then returns empty array', () => {
      expect(parseExtractionResponse('NONE')).toHaveLength(0)
    })
  })

  describe('#given empty response', () => {
    it('#then returns empty array', () => {
      expect(parseExtractionResponse('')).toHaveLength(0)
    })
  })

  describe('#given entry with invalid type', () => {
    it('#then skips that entry', () => {
      const response = `NAME: test
TYPE: invalid_type
DESCRIPTION: test
CONTENT:
test content
END`
      expect(parseExtractionResponse(response)).toHaveLength(0)
    })
  })

  describe('#given mixed valid and invalid entries', () => {
    it('#then only returns valid entries', () => {
      const response = `NAME: valid
TYPE: user
DESCRIPTION: Valid entry
CONTENT:
Valid content here
END

NAME: invalid
TYPE: badtype
DESCRIPTION: Invalid
CONTENT:
Invalid content
END

NAME: also_valid
TYPE: reference
DESCRIPTION: Also valid
CONTENT:
More valid content
END`
      const entries = parseExtractionResponse(response)
      expect(entries).toHaveLength(2)
      expect(entries[0]!.name).toBe('valid')
      expect(entries[1]!.name).toBe('also_valid')
    })
  })
})

describe('extractAndSave', () => {
  const messages: Message[] = Array.from({ length: 2 }, (_, i) => ({
    role: 'user',
    content: [{ type: 'text', text: `Message ${i}` }],
    timestamp: Date.now(),
  }))

  it('reuses existing filename when a same-type entry has equivalent content', async () => {
    const saved = new Map<string, MemoryEntry>()
    const existing: MemoryEntry = {
      name: 'old_testing_rule',
      type: 'feedback',
      description: 'Always use real databases in integration tests',
      content: 'Integration tests must hit a real database, not mocks.',
      filename: 'feedback_old_testing_rule.md',
    }
    saved.set(existing.name, existing)

    const store = {
      get: (name: string) => saved.get(name),
      list: () => saved.values(),
      save: (entry: MemoryEntry) => {
        saved.set(entry.name, entry)
      },
    }
    const config: MemoryExtractionConfig = {
      enabled: true,
      triggerMessageCount: 2,
      summarize: vi.fn().mockResolvedValue(`NAME: new_testing_rule
TYPE: feedback
DESCRIPTION: Prefer real DBs for integration tests
CONTENT:
Integration tests must hit a real database, not mocks.
END`),
    }

    const result = await extractAndSave(messages, store, config)

    expect(result.indexUpdated).toBe(true)
    expect(saved.get('new_testing_rule')?.filename).toBe('feedback_old_testing_rule.md')
  })
})

describe('extractMemories', () => {
  const messages: Message[] = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: [{ type: 'text' as const, text: `Message ${i}` }],
    timestamp: Date.now(),
  }))

  describe('#given enabled config with enough messages', () => {
    it('#then calls LLM and returns parsed entries', async () => {
      const config: MemoryExtractionConfig = {
        enabled: true,
        triggerMessageCount: 10,
        summarize: vi.fn().mockResolvedValue(sampleResponse),
      }

      const result = await extractMemories(messages, config)
      expect(config.summarize).toHaveBeenCalledOnce()
      expect(result).toHaveLength(3)
    })
  })

  describe('#given disabled config', () => {
    it('#then returns empty without calling LLM', async () => {
      const config: MemoryExtractionConfig = {
        enabled: false,
        triggerMessageCount: 10,
        summarize: vi.fn(),
      }

      const result = await extractMemories(messages, config)
      expect(config.summarize).not.toHaveBeenCalled()
      expect(result).toHaveLength(0)
    })
  })

  describe('#given too few messages', () => {
    it('#then returns empty without calling LLM', async () => {
      const config: MemoryExtractionConfig = {
        enabled: true,
        triggerMessageCount: 20,
        summarize: vi.fn(),
      }

      const result = await extractMemories(messages, config)
      expect(config.summarize).not.toHaveBeenCalled()
      expect(result).toHaveLength(0)
    })
  })

  describe('#given LLM throws', () => {
    it('#then returns empty array', async () => {
      const config: MemoryExtractionConfig = {
        enabled: true,
        triggerMessageCount: 10,
        summarize: vi.fn().mockRejectedValue(new Error('LLM error')),
      }

      const result = await extractMemories(messages, config)
      expect(result).toHaveLength(0)
    })
  })
})
