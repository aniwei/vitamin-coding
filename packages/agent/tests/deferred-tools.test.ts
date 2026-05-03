import { describe, expect, it } from 'vitest'
import {
  DeferredToolManager,
  createToolSearchTool,
  getDeferredToolNames,
} from '../src/deferred-tools'
import type { AgentTool, ToolResult } from '../src/types'
import type { ZodType } from '@x-mars/ai'

function makeSchema(props: Record<string, unknown> = {}): ZodType {
  return {
    parse: (data: unknown) => data,
    safeParse: (data: unknown) => ({ success: true, data }),
    toJSONSchema: () => ({
      type: 'object',
      properties: props,
      required: Object.keys(props),
    }),
  }
}

function makeTool(name: string, opts: Partial<AgentTool> = {}): AgentTool {
  return {
    name,
    description: `${name} tool description`,
    parameters: makeSchema({ input: { type: 'string' } }),
    shouldDefer: false,
    readonly: true,
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    ...opts,
  }
}

const readTool = makeTool('read')
const writeTool = makeTool('write', { readonly: false })
const notebookTool = makeTool('notebook_edit', {
  shouldDefer: true,
  description: 'Edit Jupyter notebooks',
})
const webSearchTool = makeTool('web_search', {
  shouldDefer: true,
  description: 'Search the web for information',
})
const cronTool = makeTool('cron_create', {
  shouldDefer: true,
  description: 'Create scheduled cron jobs',
})

const allTools = [readTool, writeTool, notebookTool, webSearchTool, cronTool]

describe('DeferredToolManager', () => {
  describe('#given tools with some shouldDefer', () => {
    it('#then hasDeferredTools is true', () => {
      const manager = new DeferredToolManager(allTools)
      expect(manager.hasDeferredTools).toBe(true)
    })

    it('#then identifies deferred tools', () => {
      const manager = new DeferredToolManager(allTools)
      expect(manager.isDeferred('notebook_edit')).toBe(true)
      expect(manager.isDeferred('web_search')).toBe(true)
      expect(manager.isDeferred('read')).toBe(false)
    })
  })

  describe('#given no deferred tools', () => {
    it('#then hasDeferredTools is false', () => {
      const manager = new DeferredToolManager([readTool, writeTool])
      expect(manager.hasDeferredTools).toBe(false)
    })
  })

  describe('getActiveTools', () => {
    it('#then excludes unloaded deferred tools', () => {
      const manager = new DeferredToolManager(allTools)
      const active = manager.getActiveTools(allTools)
      const names = active.map((t) => t.name)

      expect(names).toContain('read')
      expect(names).toContain('write')
      expect(names).not.toContain('notebook_edit')
      expect(names).not.toContain('web_search')
    })

    it('#then includes loaded deferred tools', () => {
      const manager = new DeferredToolManager(allTools)
      manager.markLoaded(['notebook_edit'])

      const active = manager.getActiveTools(allTools)
      const names = active.map((t) => t.name)

      expect(names).toContain('read')
      expect(names).toContain('notebook_edit')
      expect(names).not.toContain('web_search')
    })
  })

  describe('search', () => {
    it('#then finds tools by exact name', () => {
      const manager = new DeferredToolManager(allTools)
      const results = manager.search('notebook_edit')
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('notebook_edit')
    })

    it('#then finds tools by keyword in description', () => {
      const manager = new DeferredToolManager(allTools)
      const results = manager.search('jupyter')
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('notebook_edit')
    })

    it('#then supports select: syntax', () => {
      const manager = new DeferredToolManager(allTools)
      const results = manager.search('select:notebook_edit,web_search')
      expect(results).toHaveLength(2)
      expect(results.map((t) => t.name)).toEqual(['notebook_edit', 'web_search'])
    })

    it('#then respects maxResults', () => {
      const manager = new DeferredToolManager(allTools)
      const results = manager.search('edit search cron', 1)
      expect(results).toHaveLength(1)
    })

    it('#then returns empty for no matches', () => {
      const manager = new DeferredToolManager(allTools)
      const results = manager.search('nonexistent_xyz')
      expect(results).toHaveLength(0)
    })
  })

  describe('markLoaded', () => {
    it('#then marks tools as loaded', () => {
      const manager = new DeferredToolManager(allTools)
      expect(manager.isLoaded('notebook_edit')).toBe(false)

      manager.markLoaded(['notebook_edit'])
      expect(manager.isLoaded('notebook_edit')).toBe(true)
    })

    it('#then ignores non-deferred tool names', () => {
      const manager = new DeferredToolManager(allTools)
      manager.markLoaded(['read'])
      expect(manager.isLoaded('read')).toBe(false)
    })
  })

  describe('reset', () => {
    it('#then clears all loaded state', () => {
      const manager = new DeferredToolManager(allTools)
      manager.markLoaded(['notebook_edit', 'web_search'])

      manager.reset()
      expect(manager.isLoaded('notebook_edit')).toBe(false)
      expect(manager.isLoaded('web_search')).toBe(false)
    })
  })
})

describe('createToolSearchTool', () => {
  it('#then creates a tool with correct metadata', () => {
    const manager = new DeferredToolManager(allTools)
    const tool = createToolSearchTool(manager)

    expect(tool.name).toBe('tool_search')
    expect(tool.readonly).toBe(true)
    expect(tool.shouldDefer).toBe(false)
    expect(tool.parameters.toJSONSchema?.()).toBeDefined()
  })

  it('#then execute returns schemas for matching tools', async () => {
    const manager = new DeferredToolManager(allTools)
    const tool = createToolSearchTool(manager)

    const result = await tool.execute({
      params: { query: 'select:notebook_edit' },
      signal: new AbortController().signal,
      id: 'call_1',
      sessionId: 'sess_1',
      agentName: 'agent',
    })

    const text = (result as ToolResult).content[0]!
    expect(text.type).toBe('text')
    expect((text as { text: string }).text).toContain('notebook_edit')
    expect((text as { text: string }).text).toContain('Found 1 tool(s)')
  })

  it('#then marks found tools as loaded', async () => {
    const manager = new DeferredToolManager(allTools)
    const tool = createToolSearchTool(manager)

    expect(manager.isLoaded('notebook_edit')).toBe(false)

    await tool.execute({
      params: { query: 'select:notebook_edit' },
      signal: new AbortController().signal,
      id: 'call_1',
      sessionId: 'sess_1',
      agentName: 'agent',
    })

    expect(manager.isLoaded('notebook_edit')).toBe(true)
  })

  it('#then returns no-match message for unknown tools', async () => {
    const manager = new DeferredToolManager(allTools)
    const tool = createToolSearchTool(manager)

    const result = await tool.execute({
      params: { query: 'select:nonexistent' },
      signal: new AbortController().signal,
      id: 'call_1',
      sessionId: 'sess_1',
      agentName: 'agent',
    })

    const text = (result as ToolResult).content[0]!
    expect((text as { text: string }).text).toContain('No matching')
  })
})

describe('getDeferredToolNames', () => {
  it('#then returns only deferred tool names', () => {
    const names = getDeferredToolNames(allTools)
    expect(names).toEqual(['notebook_edit', 'web_search', 'cron_create'])
  })

  it('#then returns empty for no deferred tools', () => {
    const names = getDeferredToolNames([readTool, writeTool])
    expect(names).toEqual([])
  })
})
