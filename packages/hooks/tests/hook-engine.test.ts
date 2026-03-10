// HookEngine 单元测试
import { describe, expect, it } from 'vitest'

import { HookEngine, createHookEngine } from '../src/hook-engine'

import type { HookRegistration } from '../src/types'

describe('HookEngine', () => {
  describe('#given a fresh engine', () => {
    describe('#when registering hooks', () => {
      it('#then getRegistered returns registered hooks', () => {
        const engine = createHookEngine()
        const hook: HookRegistration<'chat.message.before'> = {
          name: 'test-hook',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() {},
        }
        engine.register(hook)

        const registered = engine.getRegistered('chat.message.before')
        expect(registered).toHaveLength(1)
        expect(registered[0]?.name).toBe('test-hook')
      })

      it('#then getRegistered without timing returns all hooks', () => {
        const engine = createHookEngine()
        engine.register({
          name: 'hook-a',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() {},
        })
        engine.register({
          name: 'hook-b',
          timing: 'tool.execute.before',
          priority: 10,
          enabled: true,
          handler() {},
        })

        expect(engine.getRegistered()).toHaveLength(2)
      })
    })

    describe('#when unregistering hooks', () => {
      it('#then hook is removed from all timings', () => {
        const engine = createHookEngine()
        engine.register({
          name: 'removable',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() {},
        })

        const removed = engine.unregister('removable')
        expect(removed).toBe(true)
        expect(engine.getRegistered('chat.message.before')).toHaveLength(0)
      })

      it('#then returns false when hook not found', () => {
        const engine = createHookEngine()
        expect(engine.unregister('nonexistent')).toBe(false)
      })
    })
  })

  describe('#given hooks with different priorities', () => {
    describe('#when execute is called', () => {
      it('#then hooks run in priority order (low number first)', async () => {
        const engine = createHookEngine()
        const order: string[] = []

        engine.register({
          name: 'priority-20',
          timing: 'chat.message.before',
          priority: 20,
          enabled: true,
          handler() { order.push('20') },
        })
        engine.register({
          name: 'priority-5',
          timing: 'chat.message.before',
          priority: 5,
          enabled: true,
          handler() { order.push('5') },
        })
        engine.register({
          name: 'priority-10',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() { order.push('10') },
        })

        const input = { message: {}, sessionId: 's1', isFirstMessage: false, metadata: {} }
        const output = { message: {}, metadata: {}, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(order).toEqual(['5', '10', '20'])
      })
    })
  })

  describe('#given a hook that throws', () => {
    describe('#when execute is called', () => {
      it('#then subsequent hooks still execute', async () => {
        const engine = createHookEngine()
        const executed: string[] = []

        engine.register({
          name: 'hook-a',
          timing: 'tool.execute.after',
          priority: 10,
          enabled: true,
          handler() {
            executed.push('a')
            throw new Error('Hook A failed')
          },
        })
        engine.register({
          name: 'hook-b',
          timing: 'tool.execute.after',
          priority: 20,
          enabled: true,
          handler() { executed.push('b') },
        })

        const input = {
          toolName: 'read',
          toolCallId: 't1',
          args: {},
          result: { content: [{ type: 'text' as const, text: 'ok' }] },
          agentName: 'test',
          sessionId: 's1',
          durationMs: 100,
        }
        const output = { result: input.result, metadata: {} }
        await engine.execute('tool.execute.after', input, output)

        expect(executed).toEqual(['a', 'b'])
      })
    })
  })

  describe('#given a disabled hook', () => {
    describe('#when disable(name) is called', () => {
      it('#then disabled hook is skipped during execution', async () => {
        const engine = createHookEngine()
        const executed: string[] = []

        engine.register({
          name: 'hook-active',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() { executed.push('active') },
        })
        engine.register({
          name: 'hook-disabled',
          timing: 'chat.message.before',
          priority: 20,
          enabled: true,
          handler() { executed.push('disabled') },
        })

        engine.disable('hook-disabled')

        const input = { message: {}, sessionId: 's1', isFirstMessage: false, metadata: {} }
        const output = { message: {}, metadata: {}, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(executed).toEqual(['active'])
      })
    })

    describe('#when enable(name) is called after disable', () => {
      it('#then hook resumes execution', async () => {
        const engine = createHookEngine()
        const executed: string[] = []

        engine.register({
          name: 'toggler',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() { executed.push('toggler') },
        })

        engine.disable('toggler')
        const input = { message: {}, sessionId: 's1', isFirstMessage: false, metadata: {} }
        const output = { message: {}, metadata: {}, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)
        expect(executed).toEqual([])

        engine.enable('toggler')
        await engine.execute('chat.message.before', input as never, output as never)
        expect(executed).toEqual(['toggler'])
      })
    })
  })

  describe('#given an event-type hook', () => {
    describe('#when emit is called', () => {
      it('#then handlers are invoked with input', async () => {
        const engine = createHookEngine()
        let received: unknown = null

        engine.register({
          name: 'session-listener',
          timing: 'session.created',
          priority: 10,
          enabled: true,
          handler(input) { received = input },
        })

        await engine.emit('session.created', { sessionId: 'test-session', metadata: { foo: 'bar' } })

        expect(received).toEqual({ sessionId: 'test-session', metadata: { foo: 'bar' } })
      })
    })
  })

  describe('#given hooks registered via enabled=false', () => {
    describe('#when execute is called', () => {
      it('#then disabled-at-registration hooks are skipped', async () => {
        const engine = createHookEngine()
        const executed: string[] = []

        engine.register({
          name: 'enabled-hook',
          timing: 'chat.message.before',
          priority: 10,
          enabled: true,
          handler() { executed.push('enabled') },
        })
        engine.register({
          name: 'disabled-at-reg',
          timing: 'chat.message.before',
          priority: 20,
          enabled: false,
          handler() { executed.push('disabled-at-reg') },
        })

        const input = { message: {}, sessionId: 's1', isFirstMessage: false, metadata: {} }
        const output = { message: {}, metadata: {}, cancelled: false }
        await engine.execute('chat.message.before', input as never, output as never)

        expect(executed).toEqual(['enabled'])
      })
    })
  })

  describe('#given clear() called', () => {
    it('#then all hooks are removed', () => {
      const engine = createHookEngine()
      engine.register({
        name: 'hook',
        timing: 'chat.message.before',
        priority: 10,
        enabled: true,
        handler() {},
      })

      engine.clear()
      expect(engine.getRegistered()).toHaveLength(0)
    })
  })
})
