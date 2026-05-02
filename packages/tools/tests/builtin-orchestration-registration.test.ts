import { describe, expect, it } from 'vitest'

import { createToolRegistry } from '../src/tool-registry'

describe('builtin orchestration registration', () => {
  it('full preset includes task/background orchestration tools', () => {
    const registry = createToolRegistry('/tmp', {
      dispatchTask: async () => ({ success: true, output: 'ok', id: 't-1' }),
      callAgent: async () => ({ success: true, output: 'ok' }),
      loadSkill: async () => ({ success: true, content: '' }),
      executeSkill: async () => ({ success: true, output: '' }),
    })

    const fullNames = new Set(registry.getAvailable('full').map((t) => t.name))

    expect(fullNames.has('review_call')).toBe(true)
    expect(fullNames.has('agent_call')).toBe(true)
    expect(fullNames.has('agent_task')).toBe(true)
    expect(fullNames.has('task_delegate')).toBe(true)
    expect(fullNames.has('task_create')).toBe(true)
    expect(fullNames.has('task_get')).toBe(true)
    expect(fullNames.has('task_list')).toBe(true)
    expect(fullNames.has('task_update')).toBe(true)
    expect(fullNames.has('background_output')).toBe(true)
    expect(fullNames.has('background_cancel')).toBe(true)
  })

  it('builtin tool metadata coverage is complete for full preset', () => {
    const registry = createToolRegistry('/tmp', {
      dispatchTask: async () => ({ success: true, output: 'ok', id: 't-1' }),
      callAgent: async () => ({ success: true, output: 'ok' }),
      loadSkill: async () => ({ success: true, content: '' }),
      executeSkill: async () => ({ success: true, output: '' }),
    })

    const coverage = registry.getMetadataCoverage('full')

    expect(coverage.total).toBeGreaterThan(0)
    expect(coverage.percent).toBe(100)
    expect(coverage.issues).toEqual([])
  })

  it('full preset documents deferred builtin tools for tool_search', () => {
    const registry = createToolRegistry('/tmp', {
      dispatchTask: async () => ({ success: true, output: 'ok', id: 't-1' }),
      callAgent: async () => ({ success: true, output: 'ok' }),
      loadSkill: async () => ({ success: true, content: '' }),
      executeSkill: async () => ({ success: true, output: '' }),
    })

    const deferred = registry.buildDeferredToolsGuidance('full')

    expect(deferred).toContain('### Deferred Tools')
    expect(deferred).toContain('Use `tool_search`')
    expect(deferred).toContain('web_search')
    expect(deferred).toContain('skill_load')
  })

  it('task/background tools return not available when callbacks are not injected', async () => {
    const registry = createToolRegistry('/tmp', {
      dispatchTask: async () => ({ success: true, output: 'ok', id: 't-1' }),
      callAgent: async () => ({ success: true, output: 'ok' }),
      loadSkill: async () => ({ success: true, content: '' }),
      executeSkill: async () => ({ success: true, output: '' }),
    })

    const signal = new AbortController().signal

    const taskCreate = registry.get('task_create')
    expect(taskCreate).toBeDefined()

    const created = await taskCreate!.execute({
      id: 'tc-noop',
      params: { prompt: 'do work' },
      signal,
    })

    expect(created.isError).toBe(true)
    expect(created.content[0]?.type).toBe('text')
    if (created.content[0]?.type === 'text') {
      expect(created.content[0].text).toContain('task_create not available')
    }

    const backgroundOutput = registry.get('background_output')
    expect(backgroundOutput).toBeDefined()

    await expect(backgroundOutput!.execute({
      id: 'bo-noop',
      params: { id: 'bg-1' },
      signal,
    })).rejects.toThrow('output function is not provided in options')
  })
})
