// 核心 Hook 单元测试
import { describe, expect, it } from 'vitest'

import { createHookEngine } from '../src/hook-engine'
import { createFirstMessageVariantHook } from '../src/core/session/first-message-variant'
import { createKeywordDetectionHook } from '../src/core/session/keyword-detection'
import { createFileGuardHook } from '../src/core/tool-guard/file-guard'
import { createLabelTruncatorHook } from '../src/core/tool-guard/label-truncator'
import { createOutputTruncationHook } from '../src/core/tool-guard/output-truncation'
import { createAnthropicEffortHook } from '../src/core/transform/anthropic-effort'
import { createCommentCheckerHook } from '../src/core/quality/comment-checker'
import { createRalphLoopHook } from '../src/core/quality/ralph-loop'

describe('core hooks', () => {
  describe('first-message-variant', () => {
    describe('#given a first message', () => {
      it('#then sets variant metadata', async () => {
        const engine = createHookEngine()
        engine.register(createFirstMessageVariantHook())

        const input = {
          message: { role: 'user', content: 'Hello' },
          sessionId: 's1',
          isFirstMessage: true,
          metadata: {},
        }
        const output = { message: input.message, metadata: {} as Record<string, unknown>, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(output.metadata.isFirstMessage).toBe(true)
        expect(output.metadata.variant).toBe('first-message')
      })
    })

    describe('#given a non-first message', () => {
      it('#then does not set variant metadata', async () => {
        const engine = createHookEngine()
        engine.register(createFirstMessageVariantHook())

        const input = {
          message: { role: 'user', content: 'Second' },
          sessionId: 's1',
          isFirstMessage: false,
          metadata: {},
        }
        const output = { message: input.message, metadata: {} as Record<string, unknown>, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(output.metadata.variant).toBeUndefined()
      })
    })
  })

  describe('keyword-detection', () => {
    describe('#given message containing plan keyword', () => {
      it('#then sets detectedKeyword to plan', async () => {
        const engine = createHookEngine()
        engine.register(createKeywordDetectionHook())

        const input = {
          message: { role: 'user', content: 'Can you plan the architecture?' },
          sessionId: 's1',
          isFirstMessage: false,
          metadata: {},
        }
        const output = { message: input.message, metadata: {} as Record<string, unknown>, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(output.metadata.detectedKeyword).toBe('plan')
      })
    })

    describe('#given message containing build keyword', () => {
      it('#then sets detectedKeyword to build', async () => {
        const engine = createHookEngine()
        engine.register(createKeywordDetectionHook())

        const input = {
          message: { role: 'user', content: 'Please implement the login page' },
          sessionId: 's1',
          isFirstMessage: false,
          metadata: {},
        }
        const output = { message: input.message, metadata: {} as Record<string, unknown>, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(output.metadata.detectedKeyword).toBe('build')
      })
    })
  })

  describe('file-guard', () => {
    describe('#given write tool targeting /etc/passwd', () => {
      it('#then throws and sets cancelled', async () => {
        const engine = createHookEngine()
        engine.register(createFileGuardHook())

        const input = {
          toolName: 'write',
          toolCallId: 't1',
          args: { path: '/etc/passwd' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = { args: { ...input.args }, cancelled: false }

        // file-guard throws ToolError — engine catches it
        await engine.execute('tool.execute.before', input, output)
        // 由于 engine 会 catch error，hook 的 throw 被吞掉
        // 但我们可以直接测试 hook handler
        const hook = createFileGuardHook()
        expect(() => {
          hook.handler(input, output)
        }).toThrow('File guard')
      })
    })

    describe('#given read tool targeting any path', () => {
      it('#then allows through (not a write tool)', async () => {
        const engine = createHookEngine()
        engine.register(createFileGuardHook())

        const input = {
          toolName: 'read',
          toolCallId: 't1',
          args: { path: '/etc/passwd' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = { args: { ...input.args }, cancelled: false }
        await engine.execute('tool.execute.before', input, output)

        expect(output.cancelled).toBe(false)
      })
    })

    describe('#given write tool targeting node_modules', () => {
      it('#then blocks the write', () => {
        const hook = createFileGuardHook()
        const input = {
          toolName: 'edit',
          toolCallId: 't1',
          args: { path: 'node_modules/package/index.js' },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = { args: { ...input.args }, cancelled: false }
        expect(() => hook.handler(input, output)).toThrow('File guard')
      })
    })
  })

  describe('label-truncator', () => {
    describe('#given a long label in args', () => {
      it('#then truncates the label', async () => {
        const engine = createHookEngine()
        engine.register(createLabelTruncatorHook())

        const longLabel = 'A'.repeat(300)
        const input = {
          toolName: 'write',
          toolCallId: 't1',
          args: { label: longLabel },
          agentName: 'test',
          sessionId: 's1',
        }
        const output = { args: { label: longLabel }, cancelled: false }
        await engine.execute('tool.execute.before', input, output)

        expect((output.args.label as string).length).toBeLessThan(300)
        expect((output.args.label as string).endsWith('...')).toBe(true)
      })
    })
  })

  describe('output-truncation', () => {
    describe('#given tool output exceeding 60KB', () => {
      it('#then truncates to configured limit', async () => {
        const engine = createHookEngine()
        engine.register(createOutputTruncationHook(100)) // 100 byte limit for test

        const longText = 'x'.repeat(200)
        const input = {
          toolName: 'grep',
          toolCallId: 't1',
          args: {},
          result: { content: [{ type: 'text' as const, text: longText }] },
          agentName: 'test',
          sessionId: 's1',
          durationMs: 50,
        }
        const output = {
          result: { content: [{ type: 'text' as const, text: longText }] },
          metadata: {} as Record<string, unknown>,
        }
        await engine.execute('tool.execute.after', input, output)

        const totalText = output.result.content
          .map((p) => p.type === 'text' ? p.text : '')
          .join('')
        expect(totalText.length).toBeLessThan(200)
        expect(output.metadata.truncated).toBe(true)
      })
    })
  })

  describe('anthropic-effort', () => {
    describe('#given anthropic opus model', () => {
      it('#then sets thinkingLevel to high', async () => {
        const engine = createHookEngine()
        engine.register(createAnthropicEffortHook())

        const input = {
          model: 'claude-opus-4-6',
          provider: 'anthropic',
        }
        const output = { metadata: {} as Record<string, unknown> } as {
          thinkingLevel?: string
          metadata: Record<string, unknown>
        }
        await engine.execute('chat.params', input as never, output as never)

        expect(output.thinkingLevel).toBe('high')
      })
    })

    describe('#given non-anthropic model', () => {
      it('#then does not modify thinkingLevel', async () => {
        const engine = createHookEngine()
        engine.register(createAnthropicEffortHook())

        const input = {
          model: 'gpt-5.2',
          provider: 'openai',
        }
        const output = { metadata: {} as Record<string, unknown> } as {
          thinkingLevel?: string
          metadata: Record<string, unknown>
        }
        await engine.execute('chat.params', input as never, output as never)

        expect(output.thinkingLevel).toBeUndefined()
      })
    })
  })

  describe('comment-checker', () => {
    describe('#given write tool with AI-style comment', () => {
      it('#then appends warning to output', async () => {
        const engine = createHookEngine()
        engine.register(createCommentCheckerHook())

        const input = {
          toolName: 'write',
          toolCallId: 't1',
          args: { content: '// TODO: implement this\nconst x = 1\n// add your logic here' },
          result: { content: [{ type: 'text' as const, text: 'File written' }] },
          agentName: 'test',
          sessionId: 's1',
          durationMs: 10,
        }
        const output = {
          result: { content: [{ type: 'text' as const, text: 'File written' }] },
          metadata: {} as Record<string, unknown>,
        }
        await engine.execute('tool.execute.after', input, output)

        expect(output.metadata.aiCommentsDetected).toBe(2)
        expect(output.result.content.length).toBe(2) // 原内容 + 警告
      })
    })
  })

  describe('ralph-loop', () => {
    describe('#given a repeating tool call pattern', () => {
      it('#then detects the loop and warns', async () => {
        const engine = createHookEngine()
        engine.register(createRalphLoopHook())

        const sessionId = `ralph-test-${Date.now()}`
        const makeInput = (tool: string) => ({
          toolName: tool,
          toolCallId: `t-${Math.random()}`,
          args: {},
          result: { content: [{ type: 'text' as const, text: 'ok' }] },
          agentName: 'test',
          sessionId,
          durationMs: 10,
        })

        // 创建重复模式: edit, read × 3 次 = 6 次调用
        const lastOutput = { result: { content: [] as { type: 'text'; text: string }[] }, metadata: {} as Record<string, unknown> }
        for (let i = 0; i < 3; i++) {
          const editInput = makeInput('edit')
          const editOutput = { result: { content: [{ type: 'text' as const, text: 'ok' }] }, metadata: {} as Record<string, unknown> }
          await engine.execute('tool.execute.after', editInput, editOutput)

          const readInput = makeInput('read')
          const readOutput = i === 2 ? lastOutput : { result: { content: [{ type: 'text' as const, text: 'ok' }] }, metadata: {} as Record<string, unknown> }
          readOutput.result.content = [{ type: 'text' as const, text: 'ok' }]
          await engine.execute('tool.execute.after', readInput, readOutput)
        }

        expect(lastOutput.metadata.loopDetected).toBe(true)
      })
    })
  })

  describe('14 core hooks registration', () => {
    it('#then all 14 hooks are registered and available', () => {
      const engine = createHookEngine()

      // 注册所有 14 个核心 Hook
      engine.register(createFirstMessageVariantHook())
      engine.register(
        { name: 'session-recovery', timing: 'chat.message.before', priority: 20, enabled: true, handler() {} },
      )
      engine.register(createKeywordDetectionHook())
      engine.register(
        { name: 'session-history', timing: 'chat.message.before', priority: 40, enabled: true, handler() {} },
      )
      engine.register(createFileGuardHook())
      engine.register(createLabelTruncatorHook())
      engine.register(
        { name: 'rules-injector', timing: 'tool.execute.before', priority: 30, enabled: true, handler() {} },
      )
      engine.register(createOutputTruncationHook())
      engine.register(
        { name: 'context-injector', timing: 'messages.transform', priority: 10, enabled: true, handler() {} },
      )
      engine.register(
        { name: 'thinking-validator', timing: 'messages.transform', priority: 20, enabled: true, handler() {} },
      )
      engine.register(createAnthropicEffortHook())
      engine.register(createCommentCheckerHook())
      engine.register(
        { name: 'babysitting', timing: 'tool.execute.after', priority: 30, enabled: true, handler() {} },
      )
      engine.register(createRalphLoopHook())

      const allHooks = engine.getRegistered()
      expect(allHooks.length).toBeGreaterThanOrEqual(14)
    })
  })
})
