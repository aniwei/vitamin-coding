// rules-injector 覆盖率测试
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createHookEngine } from '../src/hook-engine'
import { createRulesInjectorHook } from '../src/core/tool-guard/rules-injector'

let testDir = ''

beforeEach(async () => {
  testDir = join(tmpdir(), `rules-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(testDir, { recursive: true })
})

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true })
  }
})

describe('rules-injector hook', () => {
  describe('#given .rules directory with md files', () => {
    describe('#when a write tool is called', () => {
      it('#then injects rules into args', async () => {
        const rulesDir = join(testDir, '.rules')
        await mkdir(rulesDir)
        await writeFile(join(rulesDir, 'code-style.md'), 'Use single quotes')
        await writeFile(join(rulesDir, 'naming.md'), 'Use kebab-case')

        const engine = createHookEngine()
        engine.register(createRulesInjectorHook(testDir))

        const input = {
          toolName: 'write',
          toolCallId: 'tc1',
          args: { path: 'test.ts', content: 'hello' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = {
          args: { ...input.args } as Record<string, unknown>,
          cancelled: false,
        }

        await engine.execute('tool.execute.before', input as never, output as never)

        expect(output.args._injectedRules).toBeDefined()
        expect(output.args._injectedRules).toContain('code-style.md')
        expect(output.args._injectedRules).toContain('Use single quotes')
        expect(output.args._injectedRules).toContain('naming.md')
        expect(output.args._injectedRules).toContain('Use kebab-case')
      })
    })

    describe('#when an edit tool is called', () => {
      it('#then injects rules', async () => {
        const rulesDir = join(testDir, '.rules')
        await mkdir(rulesDir)
        await writeFile(join(rulesDir, 'style.md'), 'No semicolons')

        const engine = createHookEngine()
        engine.register(createRulesInjectorHook(testDir))

        const input = {
          toolName: 'edit',
          toolCallId: 'tc2',
          args: { path: 'a.ts', oldString: 'x', newString: 'y' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = {
          args: { ...input.args } as Record<string, unknown>,
          cancelled: false,
        }

        await engine.execute('tool.execute.before', input as never, output as never)

        expect(output.args._injectedRules).toContain('No semicolons')
      })
    })

    describe('#when a read tool is called', () => {
      it('#then does not inject rules', async () => {
        const rulesDir = join(testDir, '.rules')
        await mkdir(rulesDir)
        await writeFile(join(rulesDir, 'style.md'), 'rules content')

        const engine = createHookEngine()
        engine.register(createRulesInjectorHook(testDir))

        const input = {
          toolName: 'read',
          toolCallId: 'tc3',
          args: { path: 'a.ts' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = {
          args: { ...input.args } as Record<string, unknown>,
          cancelled: false,
        }

        await engine.execute('tool.execute.before', input as never, output as never)

        expect(output.args._injectedRules).toBeUndefined()
      })
    })
  })

  describe('#given no .rules directory', () => {
    describe('#when a write tool is called', () => {
      it('#then does not inject rules', async () => {
        const engine = createHookEngine()
        engine.register(createRulesInjectorHook(testDir))

        const input = {
          toolName: 'write',
          toolCallId: 'tc4',
          args: { path: 'a.ts', content: 'x' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = {
          args: { ...input.args } as Record<string, unknown>,
          cancelled: false,
        }

        await engine.execute('tool.execute.before', input as never, output as never)

        expect(output.args._injectedRules).toBeUndefined()
      })
    })
  })

  describe('#given .rules directory with no md files', () => {
    describe('#when a write tool is called', () => {
      it('#then does not inject rules', async () => {
        const rulesDir = join(testDir, '.rules')
        await mkdir(rulesDir)
        await writeFile(join(rulesDir, 'readme.txt'), 'not markdown')

        const engine = createHookEngine()
        engine.register(createRulesInjectorHook(testDir))

        const input = {
          toolName: 'write',
          toolCallId: 'tc5',
          args: { path: 'a.ts', content: 'x' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = {
          args: { ...input.args } as Record<string, unknown>,
          cancelled: false,
        }

        await engine.execute('tool.execute.before', input as never, output as never)

        expect(output.args._injectedRules).toBeUndefined()
      })
    })
  })

  describe('#given edit-diff tool name', () => {
    describe('#when called', () => {
      it('#then injects rules for edit-diff', async () => {
        const rulesDir = join(testDir, '.rules')
        await mkdir(rulesDir)
        await writeFile(join(rulesDir, 'rule.md'), 'diff rules')

        const engine = createHookEngine()
        engine.register(createRulesInjectorHook(testDir))

        const input = {
          toolName: 'edit-diff',
          toolCallId: 'tc6',
          args: { path: 'a.ts', diff: 'some diff' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = {
          args: { ...input.args } as Record<string, unknown>,
          cancelled: false,
        }

        await engine.execute('tool.execute.before', input as never, output as never)

        expect(output.args._injectedRules).toContain('diff rules')
      })
    })
  })
})
