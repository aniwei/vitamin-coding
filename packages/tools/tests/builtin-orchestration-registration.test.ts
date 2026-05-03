import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createToolRegistry } from '../src/tool-registry'

const callbacks = {
  dispatchTask: async () => ({ success: true, output: 'ok', id: 't-1' }),
  callAgent: async () => ({ success: true, output: 'ok' }),
  loadSkill: async () => ({ success: true, content: '' }),
  executeSkill: async () => ({ success: true, output: '' }),
}

describe('builtin orchestration registration', () => {
  it('full preset includes task/background orchestration tools', () => {
    const registry = createToolRegistry('/tmp', callbacks)

    const fullNames = new Set(registry.getAvailable('full').map((t) => t.name))

    expect(fullNames.has('review_call')).toBe(true)
    expect(fullNames.has('agent_call')).toBe(true)
    expect(fullNames.has('agent_task')).toBe(true)
    expect(fullNames.has('task_delegate')).toBe(true)
    expect(fullNames.has('task_create')).toBe(true)
    expect(fullNames.has('task_get')).toBe(true)
    expect(fullNames.has('task_list')).toBe(true)
    expect(fullNames.has('task_update')).toBe(true)
    expect(fullNames.has('agent_cancel')).toBe(true)
    expect(fullNames.has('background_output')).toBe(true)
    expect(fullNames.has('background_cancel')).toBe(true)
    expect(fullNames.has('agent_list')).toBe(true)
    expect(fullNames.has('scheduler_job')).toBe(true)
  })

  it('builtin tool metadata coverage is complete for full preset', () => {
    const registry = createToolRegistry('/tmp', callbacks)

    const coverage = registry.getMetadataCoverage('full')

    expect(coverage.total).toBeGreaterThan(0)
    expect(coverage.percent).toBe(100)
    expect(coverage.issues).toEqual([])
  })

  it('full preset documents deferred builtin tools for tool_search', () => {
    const registry = createToolRegistry('/tmp', callbacks)

    const deferred = registry.buildDeferredToolsGuidance('full')

    expect(deferred).toContain('### Deferred Tools')
    expect(deferred).toContain('Use `tool_search`')
    expect(deferred).toContain('web_search')
    expect(deferred).toContain('skill_load')
  })

  it('registers builtin web tools with injected providers', async () => {
    const registry = createToolRegistry('/tmp', {
      ...callbacks,
      webFetchProvider: {
        fetch: async () => ({
          provider: 'registry-fetch',
          status: 200,
          statusText: 'OK',
          contentType: 'text/plain',
          contentLength: 14,
          body: new TextEncoder().encode('registry fetch').buffer,
        }),
      },
      webSearchProvider: {
        search: async () => ({
          provider: 'registry-search',
          results: [
            {
              title: 'Registry Search',
              url: 'https://example.com/result',
              snippet: 'provider result',
            },
          ],
        }),
      },
    })

    const signal = new AbortController().signal
    const fetched = await registry.get('web_fetch')!.execute({
      id: 'wf-provider',
      params: { url: 'https://example.com/page' },
      signal,
    })
    const searched = await registry.get('web_search')!.execute({
      id: 'ws-provider',
      params: { query: 'registry' },
      signal,
    })

    expect(fetched.details).toMatchObject({ provider: 'registry-fetch' })
    expect(fetched.content[0]?.text).toContain('registry fetch')
    expect(searched.details).toMatchObject({ provider: 'registry-search' })
    expect(searched.content[0]?.text).toContain('Registry Search')
  })

  it('task/background tools return not available when callbacks are not injected', async () => {
    const registry = createToolRegistry('/tmp', callbacks)

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

    await expect(
      backgroundOutput!.execute({
        id: 'bo-noop',
        params: { id: 'bg-1' },
        signal,
      }),
    ).rejects.toThrow('output function is not provided in options')
  })

  it('standard preset can read persisted tool output artifacts with byte paging', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'x-mars-tool-output-'))
    const artifactDir = join(projectRoot, '.x-mars', 'tool-outputs', 'session-1')
    await mkdir(artifactDir, { recursive: true })
    await writeFile(join(artifactDir, 'call-1.txt'), 'abcdefghijklmnopqrstuvwxyz', 'utf-8')

    const registry = createToolRegistry(projectRoot, callbacks)
    const standardNames = new Set(registry.getAvailable('standard').map((tool) => tool.name))
    const tool = registry.get('tool_output_read')

    expect(standardNames.has('tool_output_read')).toBe(true)
    expect(tool).toBeDefined()

    const result = await tool!.execute({
      id: 'tor-1',
      params: { path: 'session-1/call-1.txt', offset: 5, limit: 10 },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('fghijklmno')
    expect(result.content[0]?.text).toContain('Use offset=15 to continue')
    expect(result.details).toMatchObject({
      relativePath: 'session-1/call-1.txt',
      offset: 5,
      limit: 10,
      sizeBytes: 26,
      returnedBytes: 10,
      hasMore: true,
    })
  })

  it('tool_output_read rejects paths outside the persisted output directory', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'x-mars-tool-output-'))
    const registry = createToolRegistry(projectRoot, callbacks)
    const tool = registry.get('tool_output_read')

    const result = await tool!.execute({
      id: 'tor-escape',
      params: { path: '../../package.json' },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Refusing to read artifact outside')
    expect(result.details).toMatchObject({
      reason: 'path_outside_tool_outputs',
    })
  })
})
