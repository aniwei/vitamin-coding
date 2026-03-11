// 扩展工具集单元测试
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { createToolRegistry } from '../src/tool-registry'
import { registerBuiltinTools } from '../src/register-builtin'
import { createGrepTool } from '../src/builtin/grep'
import { createGlobTool } from '../src/builtin/glob'
import { createFindTool } from '../src/builtin/find'
import { createLsTool } from '../src/builtin/ls'
import { createDelegateTaskTool } from '../src/orchestration/delegate-task'

let testDir: string
const signal = new AbortController().signal

// 每个测试创建临时目录
async function setupTestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vitamin-tools-ext-'))
  await mkdir(join(dir, 'src'), { recursive: true })
  await mkdir(join(dir, 'src', 'utils'), { recursive: true })
  await writeFile(join(dir, 'src', 'index.ts'), 'export const hello = "world"\nfunction main() {}\n')
  await writeFile(join(dir, 'src', 'utils', 'helper.ts'), 'export function add(a: number, b: number) { return a + b }\n')
  await writeFile(join(dir, 'README.md'), '# Test Project\nThis is a test.\n')
  await writeFile(join(dir, 'package.json'), '{"name":"test"}')
  return dir
}

describe('extended tools', () => {
  beforeEach(async () => {
    testDir = await setupTestDir()
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('grep', () => {
    describe('#given a text pattern', () => {
      it('#then finds matching lines with line numbers', async () => {
        const tool = createGrepTool(testDir)
        const result = await tool.execute('t1', {
          pattern: 'hello',
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('hello')
        expect(text).toContain('index.ts')
      })
    })

    describe('#given pattern with no matches', () => {
      it('#then returns no matches message', async () => {
        const tool = createGrepTool(testDir)
        const result = await tool.execute('t1', {
          pattern: 'nonexistent_xyz_123',
          isRegex: false,
          caseSensitive: false,
          maxResults: 100,
        }, signal)

        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('No matches')
      })
    })
  })

  describe('glob', () => {
    describe('#given **/*.ts pattern', () => {
      it('#then finds TypeScript files recursively', async () => {
        const tool = createGlobTool(testDir)
        const result = await tool.execute('t1', {
          pattern: '**/*.ts',
          maxResults: 500,
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('index.ts')
        expect(text).toContain('helper.ts')
      })
    })
  })

  describe('find', () => {
    describe('#given name filter "*.ts"', () => {
      it('#then finds TypeScript files', async () => {
        const tool = createFindTool(testDir)
        const result = await tool.execute('t1', {
          name: '*.ts',
          type: 'file',
          maxDepth: 10,
          maxResults: 200,
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('Found')
        expect(text).toContain('.ts')
      })
    })

    describe('#given type filter "directory"', () => {
      it('#then finds only directories', async () => {
        const tool = createFindTool(testDir)
        const result = await tool.execute('t1', {
          type: 'directory',
          maxDepth: 10,
          maxResults: 200,
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('src/')
      })
    })
  })

  describe('ls', () => {
    describe('#given root directory', () => {
      it('#then lists directory contents', async () => {
        const tool = createLsTool(testDir)
        const result = await tool.execute('t1', {
          path: '.',
          recursive: false,
          maxDepth: 3,
          maxEntries: 500,
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('src/')
        expect(text).toContain('README.md')
        expect(text).toContain('package.json')
      })
    })

    describe('#given recursive=true', () => {
      it('#then lists subdirectory contents', async () => {
        const tool = createLsTool(testDir)
        const result = await tool.execute('t1', {
          path: '.',
          recursive: true,
          maxDepth: 3,
          maxEntries: 500,
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('utils/')
        expect(text).toContain('helper.ts')
      })
    })

    describe('#given nonexistent directory', () => {
      it('#then returns error', async () => {
        const tool = createLsTool(testDir)
        const result = await tool.execute('t1', {
          path: 'nonexistent',
          recursive: false,
          maxDepth: 3,
          maxEntries: 500,
        }, signal)

        expect(result.isError).toBe(true)
      })
    })
  })

  describe('delegate-task', () => {
    describe('#given no dispatch function', () => {
      it('#then returns unavailable error', async () => {
        const tool = createDelegateTaskTool()
        const result = await tool.execute('t1', {
          prompt: 'Find all auth files',
          subagent: 'explore',
          mode: 'sync',
        } as never, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('not available')
      })
    })

    describe('#given a dispatch function', () => {
      it('#then delegates the task and returns result', async () => {
        const tool = createDelegateTaskTool(async (args) => ({
          success: true,
          output: `Processed: ${args.prompt}`,
        }))

        const result = await tool.execute('t1', {
          prompt: 'Find all auth files',
          subagent: 'explore',
          mode: 'sync',
        } as never, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('Processed: Find all auth files')
      })
    })
  })

  describe('standard preset registration', () => {
    it('#then standard preset contains 10 tools', () => {
      const registry = createToolRegistry()
      registerBuiltinTools(registry, testDir)

      const standardTools = registry.getAvailable('standard')
      expect(standardTools).toHaveLength(10)

      const minimalTools = registry.getAvailable('minimal')
      expect(minimalTools).toHaveLength(4)
    })
  })
})
