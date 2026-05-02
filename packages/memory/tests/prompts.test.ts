import { describe, expect, it } from 'vitest'
import {
  buildSummarizationPrompt,
  buildTurnPrefixPrompt,
  buildMemoryInjection,
  buildArchiveReference,
  SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
} from '../src/prompts'

describe('buildSummarizationPrompt', () => {
  it('#given messages only #then uses initial summarization template', () => {
    const result = buildSummarizationPrompt('Human: Hello\nAssistant: Hi')

    expect(result).toContain(SUMMARIZATION_PROMPT)
    expect(result).toContain('<conversation>')
    expect(result).toContain('Human: Hello')
    expect(result).not.toContain(UPDATE_SUMMARIZATION_PROMPT)
  })

  it('#given a previousSummary #then uses update template with existing summary', () => {
    const result = buildSummarizationPrompt('text', 'previous summary')

    expect(result).toContain(UPDATE_SUMMARIZATION_PROMPT)
    expect(result).toContain('<existing_summary>')
    expect(result).toContain('previous summary')
    expect(result).not.toContain(SUMMARIZATION_PROMPT)
  })

  it('#given customInstructions #then includes additional instructions', () => {
    const result = buildSummarizationPrompt('text', undefined, 'Keep TODOs')

    expect(result).toContain('<additional_instructions>')
    expect(result).toContain('Keep TODOs')
  })
})

describe('buildTurnPrefixPrompt', () => {
  it('#given turn prefix messages #then wraps with template', () => {
    const result = buildTurnPrefixPrompt('Assistant: working...')

    expect(result).toContain(TURN_PREFIX_SUMMARIZATION_PROMPT)
    expect(result).toContain('<turn_prefix>')
    expect(result).toContain('Assistant: working...')
  })
})

describe('buildMemoryInjection', () => {
  it('#given an empty map #then returns empty string', () => {
    expect(buildMemoryInjection(new Map())).toBe('')
  })

  it('#given memory entries #then formats as agent_memory block', () => {
    const memories = new Map([
      ['~/.x-mars/AGENTS.md', 'User prefers TypeScript'],
      ['./.x-mars/AGENTS.md', 'Project uses pnpm'],
    ])
    const result = buildMemoryInjection(memories)

    expect(result).toContain('<agent_memory>')
    expect(result).toContain('</agent_memory>')
    expect(result).toContain('# ~/.x-mars/AGENTS.md')
    expect(result).toContain('User prefers TypeScript')
    expect(result).toContain('# ./.x-mars/AGENTS.md')
    expect(result).toContain('Project uses pnpm')
    expect(result).toContain('<memory_guidelines>')
  })

  it('#given entries with blank content #then skips them', () => {
    const memories = new Map([
      ['path1', '  '],
      ['path2', 'content'],
    ])
    const result = buildMemoryInjection(memories)

    expect(result).not.toContain('# path1')
    expect(result).toContain('# path2')
  })
})

describe('buildArchiveReference', () => {
  it('#given archive path and summary #then formats reference', () => {
    const result = buildArchiveReference('/archives/s1/compaction-123.md', 'task summary')

    expect(result).toContain('/archives/s1/compaction-123.md')
    expect(result).toContain('<summary>')
    expect(result).toContain('task summary')
    expect(result).toContain('</summary>')
  })
})
