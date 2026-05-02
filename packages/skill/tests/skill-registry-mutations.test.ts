import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createSkillRegistry } from '../src'

describe('SkillRegistry mutations', () => {
  it('#then creates a valid project SKILL.md and registers it', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'vitamin-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })

    const result = await registry.create({
      name: 'code-review',
      description: 'Use when reviewing code changes',
      body: '# Code Review\n\nReview risks first.',
      tags: ['review'],
      trigger: 'auto',
    })

    expect(result.success).toBe(true)
    expect(result.path).toContain('code-review/SKILL.md')
    expect(registry.get('code-review')?.definition.metadata.description).toBe(
      'Use when reviewing code changes',
    )
    expect(readFileSync(result.path!, 'utf-8')).toContain('tags:')
  })

  it('#then searches available auto skills without returning body content', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'vitamin-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    await registry.create({
      name: 'test-driven-development',
      description: 'Use when adding tests before implementation',
      body: 'Write the failing test first.',
      tags: ['testing'],
      trigger: 'auto',
    })

    const results = await registry.search('write tests')

    expect(results[0]).toMatchObject({
      name: 'test-driven-development',
      description: 'Use when adding tests before implementation',
    })
    expect(JSON.stringify(results)).not.toContain('Write the failing test first')
  })

  it('#then improves an existing skill and records a change log', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'vitamin-skill-'))
    const registry = createSkillRegistry({ workspaceDir, library: { globalDirs: [] } })
    await registry.create({
      name: 'debugging',
      description: 'Use when debugging failures',
      body: '# Debugging\n\nReproduce first.',
    })

    const result = await registry.improve({
      name: 'debugging',
      instructions: 'Add regression test guidance.',
    })

    expect(result.success).toBe(true)
    const content = readFileSync(result.path!, 'utf-8')
    expect(content).toContain('Reproduce first.')
    expect(content).toContain('## Improvement Log')
    expect(content).toContain('Add regression test guidance.')
  })
})
