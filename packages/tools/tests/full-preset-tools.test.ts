// Phase 5.2c — Full preset 工具测试 (5.2.1, 5.2.6, 5.2.7)
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'

import { createToolRegistry } from '../src/tool-registry'
import { registerBuiltinTools } from '../src/register-builtin'
import { createEditDiffTool } from '../src/builtin/edit-diff'
import { createHashlineEditTool, hashLine } from '../src/builtin/hashline-edit'
import { createLookAtTool } from '../src/builtin/look-at'
import { createInteractiveBashTool } from '../src/builtin/interactive-bash'

let testDir = ''
const signal = new AbortController().signal

async function setupTestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vitamin-full-tools-'))
  await mkdir(join(dir, 'src'), { recursive: true })
  return dir
}

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true })
    testDir = ''
  }
})

describe('full preset tools', () => {
  // 5.2.1: full 预设含 ≥ 26 个工具
  describe('#given registerBuiltinTools with full callback options', () => {
    it('#then full preset contains at least 26 tools (5.2.1)', () => {
      const registry = createToolRegistry()
      registerBuiltinTools(registry, '/tmp/test', {})
      const fullTools = registry.getAvailable('full')
      expect(fullTools.length).toBeGreaterThanOrEqual(26)
    })

    it('#then minimal preset is subset of standard', () => {
      const registry = createToolRegistry()
      registerBuiltinTools(registry, '/tmp/test', {})
      const minimal = registry.getAvailable('minimal')
      const standard = registry.getAvailable('standard')
      expect(minimal.length).toBeLessThan(standard.length)
      const standardNames = new Set(standard.map((t) => t.name))
      for (const tool of minimal) {
        expect(standardNames.has(tool.name)).toBe(true)
      }
    })

    it('#then standard preset is subset of full', () => {
      const registry = createToolRegistry()
      registerBuiltinTools(registry, '/tmp/test', {})
      const standard = registry.getAvailable('standard')
      const full = registry.getAvailable('full')
      expect(standard.length).toBeLessThan(full.length)
      const fullNames = new Set(full.map((t) => t.name))
      for (const tool of standard) {
        expect(fullNames.has(tool.name)).toBe(true)
      }
    })
  })

  // 5.2.6: edit-diff 模糊匹配
  describe('#given edit-diff tool', () => {
    describe('#when oldString matches exactly', () => {
      it('#then performs exact replacement', async () => {
        testDir = await setupTestDir()
        await writeFile(join(testDir, 'test.txt'), 'hello world\nfoo bar\nbaz')
        const tool = createEditDiffTool(testDir)

        const result = await tool.execute('t1', {
          path: 'test.txt',
          oldString: 'foo bar',
          newString: 'replaced line',
        }, signal)

        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(result.isError).toBeUndefined()
        expect(text).toContain('Exact match')

        const content = await readFile(join(testDir, 'test.txt'), 'utf-8')
        expect(content).toContain('replaced line')
        expect(content).not.toContain('foo bar')
      })
    })

    describe('#when oldString has minor differences', () => {
      it('#then fuzzy match succeeds (5.2.6)', async () => {
        testDir = await setupTestDir()
        // 原始文件有 4 空格缩进
        await writeFile(
          join(testDir, 'fuzzy.ts'),
          '    function hello() {\n    console.log("world")\n    }\n',
        )
        const tool = createEditDiffTool(testDir)

        // oldString 用 2 空格缩进 — 微小差异
        const result = await tool.execute('t2', {
          path: 'fuzzy.ts',
          oldString: '  function hello() {\n  console.log("world")\n  }',
          newString: '    function hello() {\n    console.log("updated")\n    }',
          fuzzyThreshold: 0.6,
        }, signal)

        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        // 应为模糊匹配成功或精确匹配
        expect(result.isError).toBeUndefined()
        const content = await readFile(join(testDir, 'fuzzy.ts'), 'utf-8')
        expect(content).toContain('updated')
      })
    })

    describe('#when file does not exist', () => {
      it('#then returns error', async () => {
        testDir = await setupTestDir()
        const tool = createEditDiffTool(testDir)

        const result = await tool.execute('t3', {
          path: 'nonexistent.txt',
          oldString: 'foo',
          newString: 'bar',
        }, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('not found')
      })
    })

    describe('#when no match at all', () => {
      it('#then returns no match error', async () => {
        testDir = await setupTestDir()
        await writeFile(join(testDir, 'nope.txt'), 'completely different content')
        const tool = createEditDiffTool(testDir)

        const result = await tool.execute('t4', {
          path: 'nope.txt',
          oldString: 'zzz xxx yyy totally different string that wont match',
          newString: 'replacement',
          fuzzyThreshold: 0.95,
        }, signal)

        expect(result.isError).toBe(true)
      })
    })
  })

  // hashline-edit
  describe('#given hashline-edit tool', () => {
    describe('#when editing with correct hash', () => {
      it('#then replaces the line', async () => {
        testDir = await setupTestDir()
        const original = 'line one\nline two\nline three'
        await writeFile(join(testDir, 'hash.txt'), original)
        const tool = createHashlineEditTool(testDir)

        const expectedHash = hashLine('line two').slice(0, 8)

        const result = await tool.execute('h1', {
          path: 'hash.txt',
          lineNumber: 2,
          lineHash: expectedHash,
          newContent: 'modified line two',
        }, signal)

        expect(result.isError).toBeUndefined()
        const content = await readFile(join(testDir, 'hash.txt'), 'utf-8')
        const lines = content.split('\n')
        expect(lines[1]).toBe('modified line two')
      })
    })

    describe('#when editing with wrong hash', () => {
      it('#then returns hash mismatch error', async () => {
        testDir = await setupTestDir()
        await writeFile(join(testDir, 'hash2.txt'), 'abc\ndef\nghi')
        const tool = createHashlineEditTool(testDir)

        const result = await tool.execute('h2', {
          path: 'hash2.txt',
          lineNumber: 2,
          lineHash: 'wrong-hash',
          newContent: 'replaced',
        }, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('mismatch')
      })
    })

    describe('#when line out of range', () => {
      it('#then returns out of range error', async () => {
        testDir = await setupTestDir()
        await writeFile(join(testDir, 'hash3.txt'), 'only one line')
        const tool = createHashlineEditTool(testDir)

        const result = await tool.execute('h3', {
          path: 'hash3.txt',
          lineNumber: 99,
          lineHash: 'any',
          newContent: 'nope',
        }, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('out of range')
      })
    })
  })

  // hashLine 辅助函数
  describe('#given hashLine function', () => {
    it('#then produces consistent hash for same input', () => {
      const h1 = hashLine('test line')
      const h2 = hashLine('test line')
      expect(h1).toBe(h2)
    })

    it('#then produces different hash for different input', () => {
      const h1 = hashLine('line A')
      const h2 = hashLine('line B')
      expect(h1).not.toBe(h2)
    })
  })

  // look-at 工具
  describe('#given look-at tool', () => {
    describe('#when looking at a non-image file', () => {
      it('#then returns error for unsupported format', async () => {
        testDir = await setupTestDir()
        await writeFile(join(testDir, 'doc.txt'), 'plain text')
        const tool = createLookAtTool(testDir)

        const result = await tool.execute('l1', {
          path: 'doc.txt',
        }, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('Not a supported image format')
      })
    })

    describe('#when looking at nonexistent file', () => {
      it('#then returns file not found', async () => {
        testDir = await setupTestDir()
        const tool = createLookAtTool(testDir)

        const result = await tool.execute('l2', {
          path: 'ghost.png',
        }, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('not found')
      })
    })

    // 5.2.7: look-at 支持截图分析
    describe('#when looking at a valid png image', () => {
      it('#then returns image content block (5.2.7)', async () => {
        testDir = await setupTestDir()
        // 创建最小合法 PNG（1x1 像素红色）
        const pngHeader = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ])
        // 简单写入 PNG header 作为测试
        await writeFile(join(testDir, 'test.png'), pngHeader)
        const tool = createLookAtTool(testDir)

        const result = await tool.execute('l3', {
          path: 'test.png',
        }, signal)

        // 应该成功返回包含 image 类型的内容块
        expect(result.isError).toBeUndefined()
        const hasImage = result.content.some((c) => c.type === 'image')
        expect(hasImage).toBe(true)
      })
    })
  })

  // interactive-bash 工具
  describe('#given interactive-bash tool', () => {
    describe('#when executing a simple command', () => {
      it('#then returns command output', async () => {
        testDir = await setupTestDir()
        const tool = createInteractiveBashTool(testDir)

        const result = await tool.execute('ib1', {
          command: 'echo hello-interactive',
        }, signal)

        expect(result.isError).toBeFalsy()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('hello-interactive')
      })
    })

    describe('#when command does not exist', () => {
      it('#then returns error output', async () => {
        testDir = await setupTestDir()
        const tool = createInteractiveBashTool(testDir)

        const result = await tool.execute('ib2', {
          command: 'nonexistent_command_xyz_123',
        }, signal)

        // 命令不存在会返回错误
        expect(result.isError).toBe(true)
      })
    })
  })

  // orchestration / skill / session / task 工具（回调模式测试）
  describe('#given callback-based tools', () => {
    describe('#when delegate-task callback is not provided', () => {
      it('#then returns unavailable message', async () => {
        testDir = await setupTestDir()
        const { createStartWorkTool } = await import('../src/orchestration/start-work')
        const tool = createStartWorkTool()

        const result = await tool.execute('sw1', {
          planName: 'test-plan',
        }, signal)

        expect(result.isError).toBe(true)
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text.toLowerCase()).toContain('not available')
      })
    })

    describe('#when task-create callback is provided', () => {
      it('#then invokes callback and returns result', async () => {
        const { createTaskCreateTool } = await import('../src/task/task-create')
        let calledWith: unknown
        const tool = createTaskCreateTool(async (args) => {
          calledWith = args
          return { taskId: 'task-123' }
        })

        const result = await tool.execute('tc1', {
          prompt: '测试任务',
          subagent: 'central-secretariat',
        }, signal)

        expect(result.isError).toBeUndefined()
        expect(calledWith).toEqual({ prompt: '测试任务', category: undefined, subagent: 'central-secretariat' })
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('task-123')
      })
    })

    describe('#when task-list callback is provided', () => {
      it('#then returns task list', async () => {
        const { createTaskListTool } = await import('../src/task/task-list')
        const tool = createTaskListTool(async () => [
          { taskId: 't1', prompt: '任务 1', status: 'completed' },
          { taskId: 't2', prompt: '任务 2', status: 'running' },
        ])

        const result = await tool.execute('tl1', {}, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('t1')
        expect(text).toContain('t2')
      })
    })

    describe('#when session-manager callback is provided', () => {
      it('#then list sessions works', async () => {
        const { createSessionManagerTool } = await import('../src/session/session-manager')
        const tool = createSessionManagerTool({
          list: async () => [
            { id: 's1', title: '会话 1', createdAt: '2025-01-01' },
          ],
          create: async () => ({ id: 's2', title: 'new' }),
          remove: async () => ({ success: true }),
          compact: async () => ({ success: true }),
        })

        const result = await tool.execute('sm1', {
          action: 'list',
        }, signal)

        expect(result.isError).toBeUndefined()
        const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
        expect(text).toContain('s1')
      })
    })
  })
})
