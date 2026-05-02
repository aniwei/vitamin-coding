import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FilesystemPromptTemplateSource, InMemoryPromptTemplateSource } from '../src/prompt-template-source'

describe('InMemoryPromptTemplateSource', () => {
  it('returns empty templates by default', async () => {
    const source = new InMemoryPromptTemplateSource()
    const result = await source.load()

    expect(result.templates).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('returns provided templates', async () => {
    const templates = [
      { name: 'review', content: '# Review', filePath: '/p/review.md', source: 'project' as const },
    ]
    const source = new InMemoryPromptTemplateSource(templates)
    const result = await source.load()

    expect(result.templates).toHaveLength(1)
    expect(result.templates[0]?.name).toBe('review')
  })
})

describe('FilesystemPromptTemplateSource', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'x-mars-prompt-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('discovers prompt files from project directory', async () => {
    const promptDir = join(tempDir, '.x-mars', 'prompts')
    await mkdir(promptDir, { recursive: true })
    await writeFile(join(promptDir, 'code-review.md'), '# Code Review\nReview this code.')
    await writeFile(join(promptDir, 'refactor.md'), '# Refactor\nRefactor this code.')

    const source = new FilesystemPromptTemplateSource({ workspaceDir: tempDir })
    const result = await source.load()

    expect(result.templates.length).toBeGreaterThanOrEqual(2)

    const names = result.templates.map(t => t.name)
    expect(names).toContain('code-review')
    expect(names).toContain('refactor')

    const review = result.templates.find(t => t.name === 'code-review')
    expect(review?.source).toBe('project')
    expect(review?.content).toContain('Review this code.')
  })

  it('ignores non-md files', async () => {
    const promptDir = join(tempDir, '.x-mars', 'prompts')
    await mkdir(promptDir, { recursive: true })
    await writeFile(join(promptDir, 'valid.md'), '# Valid')
    await writeFile(join(promptDir, 'ignored.txt'), 'should be ignored')

    const source = new FilesystemPromptTemplateSource({ workspaceDir: tempDir })
    const result = await source.load()

    const projectTemplates = result.templates.filter(t => t.source === 'project')
    expect(projectTemplates).toHaveLength(1)
    expect(projectTemplates[0]?.name).toBe('valid')
  })

  it('reports collision diagnostics for duplicate names', async () => {
    const promptDir = join(tempDir, '.x-mars', 'prompts')
    const extraDir = join(tempDir, 'extra-prompts')
    await mkdir(promptDir, { recursive: true })
    await mkdir(extraDir, { recursive: true })
    await writeFile(join(promptDir, 'dupe.md'), '# First')
    await writeFile(join(extraDir, 'dupe.md'), '# Second')

    const source = new FilesystemPromptTemplateSource({
      workspaceDir: tempDir,
      promptDirs: [extraDir],
    })
    const result = await source.load()

    const collisions = result.diagnostics.filter(d => d.type === 'collision')
    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.name).toBe('dupe')
  })

  it('handles non-existent directories gracefully', async () => {
    const source = new FilesystemPromptTemplateSource({
      workspaceDir: join(tempDir, 'nonexistent'),
    })
    const result = await source.load()

    expect(result.diagnostics).toEqual([])
  })

  it('supports setPromptDirs', async () => {
    const extraDir = join(tempDir, 'dynamic')
    await mkdir(extraDir, { recursive: true })
    await writeFile(join(extraDir, 'dynamic.md'), '# Dynamic')

    const source = new FilesystemPromptTemplateSource({ workspaceDir: tempDir })

    const before = await source.load()
    const beforeNames = before.templates.map(t => t.name)
    expect(beforeNames).not.toContain('dynamic')

    source.setPromptDirs([extraDir])
    const after = await source.load()
    const afterNames = after.templates.map(t => t.name)
    expect(afterNames).toContain('dynamic')
  })
})
