// HookEngine + 新 Hook 测试
import { describe, expect, it } from 'vitest'

import { HookRegistry, createHookRegistry } from '../src/hook-registry'
import { createStreamMetricsHook, createStreamEndMetricsHook, getStreamMetrics, clearStreamMetrics } from '../src/core/stream/stream-metrics'
import { createCompactionLoggerHook, createCompactionAfterHook, getCompactionStats, clearCompactionStats } from '../src/core/compaction/compaction-logger'

// ═══ HookRegistry 测试 ═══

describe('HookRegistry', () => {
  describe('#given a new HookRegistry', () => {
    it('#then can register and execute hooks', async () => {
      const engine = createHookRegistry()
      const results: string[] = []

      engine.on('chat.message.before', 'test-hook', () => {
        results.push('executed')
      })

      const input = { message: {}, sessionId: 's1', isFirstMessage: false, metadata: {} }
      const output = { message: {}, metadata: {}, cancelled: false }
      await engine.execute('chat.message.before', input as never, output as never)

      expect(results).toEqual(['executed'])
    })

    it('#then has() returns true for registered hooks', () => {
      const engine = createHookRegistry()
      engine.on('chat.message.before', 'my-hook', () => {})

      expect(engine.has('my-hook')).toBe(true)
      expect(engine.has('nonexistent')).toBe(false)
    })

    it('#then registerAll registers multiple hooks', () => {
      const engine = createHookRegistry()
      engine.registerAll([
        { name: 'h1', timing: 'chat.message.before', priority: 10, enabled: true, handler() {} },
        { name: 'h2', timing: 'tool.execute.before', priority: 10, enabled: true, handler() {} },
      ])

      expect(engine.getRegistered()).toHaveLength(2)
    })

    it('#then unregister removes hooks', () => {
      const engine = createHookRegistry()
      engine.on('chat.message.before', 'removable', () => {})
      expect(engine.has('removable')).toBe(true)

      engine.unregister('removable')
      expect(engine.has('removable')).toBe(false)
    })

    it('#then clear removes all hooks', () => {
      const engine = createHookRegistry()
      engine.on('chat.message.before', 'h1', () => {})
      engine.on('tool.execute.before', 'h2', () => {})
      expect(engine.getRegistered().length).toBe(2)

      engine.clear()
      expect(engine.getRegistered().length).toBe(0)
    })
  })

  describe('#given minimal preset', () => {
    it('#then only registers file-guard and output-truncation', () => {
      const engine = createHookRegistry({ preset: 'minimal' })
      const names = engine.getRegistered().map((h) => h.name)

      expect(names).toContain('file-guard')
      expect(names).toContain('output-truncation')
      expect(names).toHaveLength(2)
    })
  })

  describe('#given default preset', () => {
    it('#then registers all default hooks', () => {
      const engine = createHookRegistry({ preset: 'default' })
      const names = engine.getRegistered().map((h) => h.name)

      expect(names).toContain('file-guard')
      expect(names).toContain('output-truncation')
      expect(names).toContain('label-truncator')
      expect(names).toContain('thinking-validator')
      expect(names).toContain('anthropic-effort')
      expect(names).toContain('first-message-variant')
      expect(names).toContain('babysitting')
      expect(names).toContain('ralph-loop')
      expect(names).toContain('stream-metrics')
      expect(names).toContain('compaction-logger')
    })
  })

  describe('#given strict preset', () => {
    it('#then includes default hooks plus comment-checker', () => {
      const engine = createHookRegistry({ preset: 'strict' })
      const names = engine.getRegistered().map((h) => h.name)

      expect(names).toContain('comment-checker')
      expect(names).toContain('file-guard')
    })
  })

  describe('#given none preset', () => {
    it('#then registers no hooks', () => {
      const engine = createHookRegistry({ preset: 'none' })
      expect(engine.getRegistered()).toHaveLength(0)
    })
  })

  describe('#given no preset', () => {
    it('#then registers no hooks', () => {
      const engine = createHookRegistry()
      expect(engine.getRegistered()).toHaveLength(0)
    })
  })

  describe('#when disable/enable hooks', () => {
    it('#then disabled hooks are skipped', async () => {
      const engine = createHookRegistry()
      const results: string[] = []

      engine.on('chat.message.before', 'hook-a', () => results.push('a'))
      engine.on('chat.message.before', 'hook-b', () => results.push('b'))

      engine.disable('hook-a')

      const input = { message: {}, sessionId: 's1', isFirstMessage: false, metadata: {} }
      const output = { message: {}, metadata: {}, cancelled: false }
      await engine.execute('chat.message.before', input as never, output as never)

      expect(results).toEqual(['b'])

      engine.enable('hook-a')
      results.length = 0
      await engine.execute('chat.message.before', input as never, output as never)

      expect(results).toEqual(['a', 'b'])
    })
  })

  describe('#when emit is called for event hooks', () => {
    it('#then event handlers are invoked', async () => {
      const engine = createHookRegistry()
      let received: unknown = null

      engine.on('session.created', 'test-listener', (input) => {
        received = input
      })

      await engine.emit('session.created', { sessionId: 'test-id', metadata: {} })
      expect(received).toEqual({ sessionId: 'test-id', metadata: {} })
    })
  })
})

// ═══ Stream Metrics Hook 测试 ═══

describe('stream-metrics', () => {
  describe('#given stream metrics hooks registered', () => {
    it('#then tracks stream start events', async () => {
      const registry = createHookRegistry()
      registry.register(createStreamMetricsHook())

      const sessionId = `stream-test-${Date.now()}`
      await registry.emit('stream.start', { sessionId, model: 'claude-sonnet-4-20250514' })

      const metrics = getStreamMetrics(sessionId)
      expect(metrics).toBeDefined()
      expect(metrics?.model).toBe('claude-sonnet-4-20250514')
      expect(metrics?.requestCount).toBe(1)

      clearStreamMetrics(sessionId)
    })

    it('#then tracks stream end events with duration', async () => {
      const registry = createHookRegistry()
      registry.register(createStreamMetricsHook())
      registry.register(createStreamEndMetricsHook())

      const sessionId = `stream-end-test-${Date.now()}`
      await registry.emit('stream.start', { sessionId, model: 'gpt-5.2' })

      // 小延迟
      await new Promise((r) => setTimeout(r, 10))
      await registry.emit('stream.end', { sessionId, model: 'gpt-5.2', stopReason: 'end_turn' })

      const metrics = getStreamMetrics(sessionId)
      expect(metrics?.lastStopReason).toBe('end_turn')
      expect(metrics?.totalDurationMs).toBeGreaterThan(0)

      clearStreamMetrics(sessionId)
    })

    it('#then increments request count on multiple starts', async () => {
      const registry = createHookRegistry()
      registry.register(createStreamMetricsHook())

      const sessionId = `stream-multi-${Date.now()}`
      await registry.emit('stream.start', { sessionId, model: 'claude-sonnet-4-20250514' })
      await registry.emit('stream.start', { sessionId, model: 'claude-sonnet-4-20250514' })
      await registry.emit('stream.start', { sessionId, model: 'claude-sonnet-4-20250514' })

      const metrics = getStreamMetrics(sessionId)
      expect(metrics?.requestCount).toBe(3)

      clearStreamMetrics(sessionId)
    })
  })
})

// ═══ Compaction Logger Hook 测试 ═══

describe('compaction-logger', () => {
  describe('#given compaction hooks registered', () => {
    it('#then tracks compaction before events', async () => {
      const registry = createHookRegistry()
      registry.register(createCompactionLoggerHook())

      const sessionId = `compact-test-${Date.now()}`
      await registry.emit('compaction.before', { sessionId, messageCount: 42 })

      const stats = getCompactionStats(sessionId)
      expect(stats).toBeDefined()
      expect(stats?.compactionCount).toBe(1)

      clearCompactionStats(sessionId)
    })

    it('#then tracks compaction after events with duration', async () => {
      const registry = createHookRegistry()
      registry.register(createCompactionLoggerHook())
      registry.register(createCompactionAfterHook())

      const sessionId = `compact-after-${Date.now()}`
      await registry.emit('compaction.before', { sessionId, messageCount: 20 })

      await new Promise((r) => setTimeout(r, 10))
      await registry.emit('compaction.after', { sessionId, retainedCount: 5 })

      const stats = getCompactionStats(sessionId)
      expect(stats?.compactionCount).toBe(1)
      expect(stats?.totalCompacted).toBe(5)

      clearCompactionStats(sessionId)
    })

    it('#then increments compaction count on multiple compactions', async () => {
      const registry = createHookRegistry()
      registry.register(createCompactionLoggerHook())

      const sessionId = `compact-multi-${Date.now()}`
      await registry.emit('compaction.before', { sessionId, messageCount: 10 })
      await registry.emit('compaction.before', { sessionId, messageCount: 15 })
      await registry.emit('compaction.before', { sessionId, messageCount: 20 })

      const stats = getCompactionStats(sessionId)
      expect(stats?.compactionCount).toBe(3)

      clearCompactionStats(sessionId)
    })
  })
})
