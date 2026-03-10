// 补充核心 Hook 覆盖率测试 — 覆盖 session-recovery, session-history,
// rules-injector, context-injector, thinking-validator, babysitting,
// ralph-loop (更多分支), anthropic-effort (sonnet/haiku)
import { describe, expect, it } from 'vitest'

import { createHookRegistry } from '../src/hook-registry'
import { createSessionRecoveryHook } from '../src/core/session/session-recovery'
import { createSessionHistoryHook } from '../src/core/session/session-history'
import { createContextInjectorHook } from '../src/core/transform/context-injector'
import { createThinkingValidatorHook } from '../src/core/transform/thinking-validator'
import { createAnthropicEffortHook } from '../src/core/transform/anthropic-effort'
import { createBabysittingHook } from '../src/core/quality/babysitting'
import { createRalphLoopHook } from '../src/core/quality/ralph-loop'

describe('session-recovery hook', () => {
  describe('#given a recovered session', () => {
    describe('#when message is processed', () => {
      it('#then sets sessionRecovered metadata', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createSessionRecoveryHook())

        const input = {
          message: { role: 'user', content: 'hello' },
          sessionId: 's1',
          isFirstMessage: false,
          metadata: { recovered: true },
        }
        const output = {
          message: input.message,
          metadata: {} as Record<string, unknown>,
          cancelled: false,
        }

        await hookRegistry.execute('chat.message.before', input as never, output as never)
        expect(output.metadata.sessionRecovered).toBe(true)
      })
    })
  })

  describe('#given a normal session', () => {
    describe('#when message is processed', () => {
      it('#then does not set sessionRecovered', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createSessionRecoveryHook())

        const input = {
          message: { role: 'user', content: 'hello' },
          sessionId: 's1',
          isFirstMessage: false,
          metadata: {},
        }
        const output = {
          message: input.message,
          metadata: {} as Record<string, unknown>,
          cancelled: false,
        }

        await hookRegistry.execute('chat.message.before', input as never, output as never)
        expect(output.metadata.sessionRecovered).toBeUndefined()
      })
    })
  })
})

describe('session-history hook', () => {
  describe('#given a message with sessionId', () => {
    describe('#when processed', () => {
      it('#then injects sessionId into metadata', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createSessionHistoryHook())

        const input = {
          message: { role: 'user', content: 'hello' },
          sessionId: 'sess-999',
          isFirstMessage: false,
          metadata: {},
        }
        const output = {
          message: input.message,
          metadata: {} as Record<string, unknown>,
          cancelled: false,
        }

        await hookRegistry.execute('chat.message.before', input as never, output as never)
        expect(output.metadata.sessionId).toBe('sess-999')
      })
    })
  })
})

describe('context-injector hook', () => {
  describe('#given context providers', () => {
    describe('#when providers return content', () => {
      it('#then injects context at message head', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createContextInjectorHook({
          contextProviders: [
            { name: 'env', getContext: () => 'ENV_CONTEXT: production' },
            { name: 'rules', getContext: () => 'RULES: no semicolons' },
          ],
        }))

        const input = {
          messages: [{ role: 'user', content: 'hello' }],
        }
        const output = {
          messages: [{ role: 'user', content: 'hello' }],
        }

        await hookRegistry.execute('messages.transform', input as never, output as never)

        expect(output.messages.length).toBe(2)
        const injected = output.messages[0] as { role: string; content: string }
        expect(injected.role).toBe('system')
        expect(injected.content).toContain('ENV_CONTEXT: production')
        expect(injected.content).toContain('RULES: no semicolons')
      })
    })

    describe('#when a provider throws', () => {
      it('#then skips that provider without blocking', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createContextInjectorHook({
          contextProviders: [
            {
              name: 'failing', getContext: () => {
                throw new Error('boom')
              },
            },
            { name: 'ok', getContext: () => 'OK_CONTEXT' },
          ],
        }))

        const input = { messages: [{ role: 'user', content: 'hello' }] }
        const output = { messages: [{ role: 'user', content: 'hello' }] }

        await hookRegistry.execute('messages.transform', input as never, output as never)

        expect(output.messages.length).toBe(2)
        const injected = output.messages[0] as { role: string; content: string }
        expect(injected.content).toContain('OK_CONTEXT')
      })
    })

    describe('#when all providers return null', () => {
      it('#then does not inject anything', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createContextInjectorHook({
          contextProviders: [
            { name: 'empty', getContext: () => null },
          ],
        }))

        const input = { messages: [{ role: 'user', content: 'hello' }] }
        const output = { messages: [{ role: 'user', content: 'hello' }] }

        await hookRegistry.execute('messages.transform', input as never, output as never)
        expect(output.messages.length).toBe(1)
      })
    })

    describe('#when async provider is used', () => {
      it('#then resolves promise and injects', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createContextInjectorHook({
          contextProviders: [
            { name: 'async', getContext: () => Promise.resolve('ASYNC_CTX') },
          ],
        }))

        const input = { messages: [{ role: 'user', content: 'hello' }] }
        const output = { messages: [{ role: 'user', content: 'hello' }] }

        await hookRegistry.execute('messages.transform', input as never, output as never)
        expect(output.messages.length).toBe(2)
      })
    })
  })
})

describe('thinking-validator hook', () => {
  describe('#given messages with empty thinking blocks', () => {
    describe('#when processed', () => {
      it('#then removes empty thinking blocks', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createThinkingValidatorHook())

        const input = {
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: '' },
                { type: 'text', text: 'Hello' },
              ],
            },
          ],
        }
        const output = {
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: '' },
                { type: 'text', text: 'Hello' },
              ],
            },
          ],
        }

        await hookRegistry.execute('messages.transform', input as never, output as never)

        const msg = output.messages[0] as { content: Array<{ type: string }> }
        expect(msg.content).toHaveLength(1)
        expect(msg.content[0]!.type).toBe('text')
      })
    })
  })

  describe('#given messages with valid thinking blocks', () => {
    describe('#when processed', () => {
      it('#then preserves valid thinking blocks', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createThinkingValidatorHook())

        const input = {
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'Let me consider...' },
                { type: 'text', text: 'Result' },
              ],
            },
          ],
        }
        const output = {
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'Let me consider...' },
                { type: 'text', text: 'Result' },
              ],
            },
          ],
        }

        await hookRegistry.execute('messages.transform', input as never, output as never)

        const msg = output.messages[0] as { content: Array<{ type: string }> }
        expect(msg.content).toHaveLength(2)
      })
    })
  })

  describe('#given non-assistant messages', () => {
    describe('#when processed', () => {
      it('#then leaves them unchanged', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createThinkingValidatorHook())

        const input = {
          messages: [{ role: 'user', content: 'Hello' }],
        }
        const output = {
          messages: [{ role: 'user', content: 'Hello' }],
        }

        await hookRegistry.execute('messages.transform', input as never, output as never)
        expect(output.messages).toHaveLength(1)
        expect((output.messages[0] as { content: string }).content).toBe('Hello')
      })
    })
  })

  describe('#given whitespace-only thinking block', () => {
    describe('#when processed', () => {
      it('#then removes the whitespace-only thinking block', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createThinkingValidatorHook())

        const input = {
          messages: [{
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: '   \n  ' },
              { type: 'text', text: 'Answer' },
            ],
          }],
        }
        const output = {
          messages: [{
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: '   \n  ' },
              { type: 'text', text: 'Answer' },
            ],
          }],
        }

        await hookRegistry.execute('messages.transform', input as never, output as never)
        const msg = output.messages[0] as { content: Array<{ type: string }> }
        expect(msg.content).toHaveLength(1)
        expect(msg.content[0]!.type).toBe('text')
      })
    })
  })
})

describe('anthropic-effort hook — extended branches', () => {
  describe('#given anthropic sonnet model', () => {
    describe('#when no thinkingLevel set', () => {
      it('#then sets thinkingLevel to medium', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createAnthropicEffortHook())

        const input = { model: 'claude-sonnet-4-6', provider: 'anthropic' }
        const output = { metadata: {} } as { thinkingLevel?: string; metadata: Record<string, unknown> }

        await hookRegistry.execute('chat.params', input as never, output as never)
        expect(output.thinkingLevel).toBe('medium')
      })
    })
  })

  describe('#given anthropic haiku model', () => {
    describe('#when no thinkingLevel set', () => {
      it('#then sets thinkingLevel to low', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createAnthropicEffortHook())

        const input = { model: 'claude-haiku-4-5', provider: 'anthropic' }
        const output = { metadata: {} } as { thinkingLevel?: string; metadata: Record<string, unknown> }

        await hookRegistry.execute('chat.params', input as never, output as never)
        expect(output.thinkingLevel).toBe('low')
      })
    })
  })

  describe('#given already-set thinkingLevel', () => {
    describe('#when processed', () => {
      it('#then does not override', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createAnthropicEffortHook())

        const input = { model: 'claude-opus-4-6', provider: 'anthropic' }
        const output = { thinkingLevel: 'low', metadata: {} } as {
          thinkingLevel?: string
          metadata: Record<string, unknown>
        }

        await hookRegistry.execute('chat.params', input as never, output as never)
        expect(output.thinkingLevel).toBe('low')
      })
    })
  })
})

describe('babysitting hook', () => {
  describe('#given consecutive tool errors', () => {
    describe('#when 3+ sequential errors occur', () => {
      it('#then sets babysittingWarning metadata', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createBabysittingHook())

        const sessionId = `bab-${Date.now()}`
        let lastOutput = { result: { content: [{ type: 'text' as const, text: 'err' }] }, metadata: {} as Record<string, unknown> }

        for (let i = 0; i < 4; i++) {
          const input = {
            toolName: 'bash',
            toolCallId: `t-${i}`,
            args: {},
            result: { content: [{ type: 'text' as const, text: 'error' }], isError: true },
            agentName: 'test',
            sessionId,
            durationMs: 10,
          }
          lastOutput = {
            result: { content: [{ type: 'text' as const, text: 'err' }] },
            metadata: {} as Record<string, unknown>,
          }
          await hookRegistry.execute('tool.execute.after', input as never, lastOutput as never)
        }

        expect(lastOutput.metadata.babysittingWarning).toBeDefined()
        expect(lastOutput.metadata.babysittingWarning).toContain('consecutive tool errors')
      })
    })
  })

  describe('#given repetitive same tool calls', () => {
    describe('#when tool called 5+ times', () => {
      it('#then warns about possible loop', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createBabysittingHook())

        const sessionId = `bab-repeat-${Date.now()}`
        let lastOutput = { result: { content: [{ type: 'text' as const, text: 'ok' }] }, metadata: {} as Record<string, unknown> }

        for (let i = 0; i < 6; i++) {
          const input = {
            toolName: 'grep',
            toolCallId: `t-${i}`,
            args: {},
            result: { content: [{ type: 'text' as const, text: 'found' }], isError: false },
            agentName: 'test',
            sessionId,
            durationMs: 10,
          }
          lastOutput = {
            result: { content: [{ type: 'text' as const, text: 'ok' }] },
            metadata: {} as Record<string, unknown>,
          }
          await hookRegistry.execute('tool.execute.after', input as never, lastOutput as never)
        }

        expect(lastOutput.metadata.babysittingWarning).toContain('grep')
        expect(lastOutput.metadata.babysittingWarning).toContain('times recently')
      })
    })
  })

  describe('#given mixed tool calls with no issues', () => {
    describe('#when tools complete normally', () => {
      it('#then no warning is set', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createBabysittingHook())

        const sessionId = `bab-ok-${Date.now()}`
        const tools = ['read', 'grep', 'write']

        for (const tool of tools) {
          const input = {
            toolName: tool,
            toolCallId: `t-${tool}`,
            args: {},
            result: { content: [{ type: 'text' as const, text: 'ok' }], isError: false },
            agentName: 'test',
            sessionId,
            durationMs: 10,
          }
          const output = {
            result: { content: [{ type: 'text' as const, text: 'ok' }] },
            metadata: {} as Record<string, unknown>,
          }
          await hookRegistry.execute('tool.execute.after', input as never, output as never)
          expect(output.metadata.babysittingWarning).toBeUndefined()
        }
      })
    })
  })
})

describe('ralph-loop hook — extended patterns', () => {
  describe('#given no repeating pattern', () => {
    describe('#when different tools are called', () => {
      it('#then no loop is detected', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createRalphLoopHook())

        const sessionId = `ralph-no-loop-${Date.now()}`
        const tools = ['read', 'grep', 'write', 'edit', 'bash', 'ls']

        for (const tool of tools) {
          const input = {
            toolName: tool,
            toolCallId: `t-${tool}`,
            args: {},
            result: { content: [{ type: 'text' as const, text: 'ok' }] },
            agentName: 'test',
            sessionId,
            durationMs: 10,
          }
          const output = {
            result: { content: [{ type: 'text' as const, text: 'ok' }] },
            metadata: {} as Record<string, unknown>,
          }
          await hookRegistry.execute('tool.execute.after', input as never, output as never)
          expect(output.metadata.loopDetected).toBeUndefined()
        }
      })
    })
  })

  describe('#given a 3-tool repeating pattern', () => {
    describe('#when pattern repeats 3 times', () => {
      it('#then detects the loop', async () => {
        const hookRegistry = createHookRegistry()
        hookRegistry.register(createRalphLoopHook())

        const sessionId = `ralph-3pat-${Date.now()}`
        const pattern = ['read', 'edit', 'bash']
        let lastOutput = { result: { content: [{ type: 'text' as const, text: 'ok' }] }, metadata: {} as Record<string, unknown> }

        for (let rep = 0; rep < 3; rep++) {
          for (const tool of pattern) {
            const input = {
              toolName: tool,
              toolCallId: `t-${rep}-${tool}`,
              args: {},
              result: { content: [{ type: 'text' as const, text: 'ok' }] },
              agentName: 'test',
              sessionId,
              durationMs: 10,
            }
            lastOutput = {
              result: { content: [{ type: 'text' as const, text: 'ok' }] },
              metadata: {} as Record<string, unknown>,
            }
            await hookRegistry.execute('tool.execute.after', input as never, lastOutput as never)
          }
        }

        expect(lastOutput.metadata.loopDetected).toBe(true)
        expect(lastOutput.metadata.loopPattern).toEqual(pattern)
      })
    })
  })
})
