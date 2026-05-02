import { describe, expect, it } from 'vitest'
import { InMemoryMemorySource } from '../src/memory-source'

describe('InMemoryMemorySource', () => {
  it('returns empty injection when no memories', async () => {
    const source = new InMemoryMemorySource()
    const result = await source.load()

    expect(result.injection).toBe('')
    expect(result.memories.size).toBe(0)
  })

  it('returns injection with memories', async () => {
    const memories = new Map<string, string>()
    memories.set('~/.x-mars/AGENTS.md', '# Global\nBe helpful.')
    memories.set('./.x-mars/AGENTS.md', '# Project\nUse TypeScript.')

    const source = new InMemoryMemorySource(memories)
    const result = await source.load()

    expect(result.injection).toContain('<agent_memory>')
    expect(result.injection).toContain('Be helpful.')
    expect(result.injection).toContain('Use TypeScript.')
    expect(result.injection).toContain('</agent_memory>')
    expect(result.memories.size).toBe(2)
  })

  it('skips empty memory entries', async () => {
    const memories = new Map<string, string>()
    memories.set('empty', '   ')
    memories.set('valid', 'content')

    const source = new InMemoryMemorySource(memories)
    const result = await source.load()

    expect(result.injection).toContain('content')
    expect(result.injection).not.toContain('empty')
  })

  it('dispose is a no-op', () => {
    const source = new InMemoryMemorySource()
    expect(() => source.dispose()).not.toThrow()
  })
})
