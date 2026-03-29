import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createFileSystemPlanFileStore } from '../src/plan-file-store'

describe('createFileSystemPlanFileStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plan-fs-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('write + read round-trips content', async () => {
    const store = createFileSystemPlanFileStore({ directory: dir })
    const content = '# My Plan\n\n### Task 1: Setup\n\n- [ ] Do something'

    await store.write('test-plan.md', content)
    const result = await store.read('test-plan.md')

    expect(result).toBe(content)
  })

  it('exists returns true for written file', async () => {
    const store = createFileSystemPlanFileStore({ directory: dir })
    await store.write('exists.md', '# Plan')

    expect(await store.exists('exists.md')).toBe(true)
  })

  it('exists returns false for non-existent file', async () => {
    const store = createFileSystemPlanFileStore({ directory: dir })
    expect(await store.exists('nonexistent.md')).toBe(false)
  })

  it('read throws on non-existent file', async () => {
    const store = createFileSystemPlanFileStore({ directory: dir })
    await expect(store.read('missing.md')).rejects.toThrow()
  })

  it('sanitizes path traversal attempts', async () => {
    const store = createFileSystemPlanFileStore({ directory: dir })
    await store.write('../../../etc/passwd', 'safe content')

    // File should be written inside the directory, not outside
    const files = await readdir(dir)
    expect(files.length).toBe(1)
    expect(files[0]).not.toContain('..')
  })

  it('auto-creates directory on first operation', async () => {
    const nestedDir = join(dir, 'nested', 'deep')
    const store = createFileSystemPlanFileStore({ directory: nestedDir })

    await store.write('plan.md', '# Plan')
    const result = await store.read('plan.md')
    expect(result).toBe('# Plan')
  })

  it('handles concurrent writes', async () => {
    const store = createFileSystemPlanFileStore({ directory: dir })

    await Promise.all([
      store.write('a.md', '# A'),
      store.write('b.md', '# B'),
      store.write('c.md', '# C'),
    ])

    const files = await readdir(dir)
    expect(files.length).toBe(3)
  })
})
