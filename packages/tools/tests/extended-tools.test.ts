import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFind } from '../src/search/find'
import { createGrep } from '../src/search/grep'
import { createLs } from '../src/search/ls'
import { createTaskDelegate } from '../src/orchestration/task-delegate'

let testDir = ''
const signal = new AbortController().signal

async function setupTestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vitamin-tools-ext-'))
  await mkdir(join(dir, 'src', 'utils'), { recursive: true })
  await writeFile(join(dir, 'src', 'index.ts'), 'export const hello = "world"\n')
  await writeFile(join(dir, 'src', 'utils', 'helper.ts'), 'export const add = (a: number, b: number) => a + b\n')
  await writeFile(join(dir, 'README.md'), '# Test Project\n')
  return dir
}

describe('extended tools', () => {
  beforeEach(async () => {
    testDir = await setupTestDir()
  })

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true })
      testDir = ''
    }
  })

  describe('ls', () => {
    it('lists directory contents', async () => {
      const tool = createLs(testDir)
      const result = await tool.execute({
        id: 'ls1',
        params: { path: '.', limit: 200 },
        signal,
      })

      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(result.isError).toBeUndefined()
      expect(text).toContain('src/')
      expect(text).toContain('README.md')
    })

    it('throws when path does not exist', async () => {
      const tool = createLs(testDir)
      await expect(tool.execute({
        id: 'ls2',
        params: { path: 'ghost-dir' },
        signal,
      })).rejects.toThrow('ENOENT')
    })
  })

  describe('find', () => {
    it('finds files via injected glob implementation', async () => {
      const tool = createFind(testDir, {
        glob: async () => [join(testDir, 'src', 'index.ts'), join(testDir, 'src', 'utils', 'helper.ts')],
      })

      const result = await tool.execute({
        id: 'find1',
        params: { pattern: '**/*.ts', limit: 50 },
        signal,
      })

      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(result.isError).toBeUndefined()
      expect(text).toContain('src/index.ts')
      expect(text).toContain('src/utils/helper.ts')
    })

    it('throws when no files match', async () => {
      const tool = createFind(testDir, {
        glob: async () => [],
      })

      await expect(tool.execute({
        id: 'find2',
        params: { pattern: '**/*.none' },
        signal,
      })).rejects.toThrow('No files found matching pattern')
    })
  })

  describe('grep', () => {
    it('throws when binary executor is not provided', async () => {
      const tool = createGrep(testDir, {})
      await expect(tool.execute({
        id: 'grep1',
        params: { pattern: 'hello' },
        signal,
      })).rejects.toThrow('ripgrep (rg) executor is not available')
    })
  })

  describe('task_delegate', () => {
    it('delegates successfully when dispatch function is provided', async () => {
      const tool = createTaskDelegate(testDir, async (args) => ({
        success: true,
        output: `Processed: ${args.prompt}`,
      }))

      const result = await tool.execute({
        id: 'td1',
        params: {
          prompt: 'Find auth code',
          subagent: 'explore',
          mode: 'sync',
        },
        signal,
      })

      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(result.isError).toBeUndefined()
      expect(text).toContain('Task delegated successfully')
      expect(text).toContain('Processed: Find auth code')
    })
  })
})
