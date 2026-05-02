// @x-mars/tools ToolRegistry 测试
import { describe, expect, it } from 'vitest'
import { ToolRegistry } from '../src/tool-registry'

import type { AgentTool } from '@x-mars/agent'

// 最小 AgentTool stub
function makeTool(name: string): AgentTool {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: {
      safeParse(input: unknown) {
        return { success: true as const, data: input }
      },
    } as never,
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
  }
}

describe('ToolRegistry', () => {
  describe('#given empty registry', () => {
    it('#then size is 0', () => {
      const registry = new ToolRegistry()
      expect(registry.size).toBe(0)
    })

    it('#then getAll returns empty', () => {
      const registry = new ToolRegistry()
      expect(registry.getAll()).toHaveLength(0)
    })
  })

  describe('#when register() is called', () => {
    it('#then tool is retrievable by name', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), {
        preset: 'minimal',
        category: 'filesystem',
        builtin: true,
      })
      expect(registry.has('read')).toBe(true)
      expect(registry.get('read')?.name).toBe('read')
      expect(registry.size).toBe(1)
    })

    it('#then shouldDefer metadata is propagated to registered tools', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('web_search'), {
        preset: 'standard',
        category: 'web',
        shouldDefer: true,
      })

      const tool = registry.get('web_search')
      expect(tool?.shouldDefer).toBe(true)
      expect(tool?.metadata.shouldDefer).toBe(true)
    })

    it('#then explicit registration shouldDefer overrides tool default', () => {
      const registry = new ToolRegistry()
      registry.register({ ...makeTool('read'), shouldDefer: true }, { shouldDefer: false })

      expect(registry.get('read')?.shouldDefer).toBe(false)
      expect(registry.get('read')?.metadata.shouldDefer).toBe(false)
    })

    it('#then metadata uses tool default when registration omits shouldDefer', () => {
      const registry = new ToolRegistry()
      registry.register({ ...makeTool('web_fetch'), shouldDefer: true })

      expect(registry.get('web_fetch')?.shouldDefer).toBe(true)
      expect(registry.get('web_fetch')?.metadata.shouldDefer).toBe(true)
    })

    it('#then shouldDefer defaults to false for non-deferred tools', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'))

      expect(registry.get('read')?.shouldDefer).toBe(false)
      expect(registry.get('read')?.metadata.shouldDefer).toBe(false)
    })
  })

  describe('#when unregister() is called', () => {
    it('#then tool is removed', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'))
      expect(registry.has('read')).toBe(true)
      registry.unregister('read')
      expect(registry.has('read')).toBe(false)
      expect(registry.size).toBe(0)
    })

    it('#then returns false for unknown tool', () => {
      const registry = new ToolRegistry()
      expect(registry.unregister('nonexistent')).toBe(false)
    })
  })

  describe('#given tools with different presets', () => {
    function setupRegistry() {
      const registry = new ToolRegistry()
      registry.register(makeTool('core'), { preset: 'minimal' })
      registry.register(makeTool('std'), { preset: 'standard' })
      registry.register(makeTool('extra'), { preset: 'full' })
      return registry
    }

    describe('#when getAvailable("minimal")', () => {
      it('#then returns only minimal tools', () => {
        const registry = setupRegistry()
        const available = registry.getAvailable('minimal')
        expect(available).toHaveLength(1)
        expect(available[0]?.name).toBe('core')
      })
    })

    describe('#when getAvailable("standard")', () => {
      it('#then returns minimal + standard tools', () => {
        const registry = setupRegistry()
        const available = registry.getAvailable('standard')
        expect(available).toHaveLength(2)
        const names = available.map((t) => t.name)
        expect(names).toContain('core')
        expect(names).toContain('std')
      })
    })

    describe('#when getAvailable("full")', () => {
      it('#then returns all tools', () => {
        const registry = setupRegistry()
        const available = registry.getAvailable('full')
        expect(available).toHaveLength(3)
      })
    })
  })

  describe('#given tools with categories', () => {
    it('#then getByCategory() filters correctly', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), { category: 'filesystem' })
      registry.register(makeTool('write'), { category: 'filesystem' })
      registry.register(makeTool('bash'), { category: 'shell' })

      const fs = registry.getByCategory('filesystem')
      expect(fs).toHaveLength(2)
      expect(registry.getByCategory('shell')).toHaveLength(1)
      expect(registry.getByCategory('unknown')).toHaveLength(0)
    })
  })

  describe('#given builtin and non-builtin tools', () => {
    it('#then getBuiltin() returns only builtin', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), { builtin: true })
      registry.register(makeTool('custom'), { builtin: false })

      const builtins = registry.getBuiltin()
      expect(builtins).toHaveLength(1)
      expect(builtins[0]?.name).toBe('read')
    })
  })

  describe('#when filterByNames() is called', () => {
    it('#then returns only named tools', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      registry.register(makeTool('c'))

      const filtered = registry.filterByNames(['a', 'c'])
      expect(filtered).toHaveLength(2)
    })
  })

  describe('#when excludeByNames() is called', () => {
    it('#then excludes named tools', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      registry.register(makeTool('c'))

      const excluded = registry.excludeByNames(['b'])
      expect(excluded).toHaveLength(2)
      expect(excluded.map((t) => t.name)).not.toContain('b')
    })
  })

  describe('#when clear() is called', () => {
    it('#then registry is empty', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      expect(registry.size).toBe(2)

      registry.clear()
      expect(registry.size).toBe(0)
    })
  })

  describe('#when execute is called on a retrieved tool', () => {
    it('#then execute receives ctx params and returns expected content', async () => {
      const registry = new ToolRegistry()
      let received: unknown

      const execTool: AgentTool = {
        name: 'echo',
        description: 'echo tool',
        parameters: {
          safeParse(input: unknown) {
            return { success: true as const, data: input }
          },
        } as never,
        execute: async (ctx) => {
          received = ctx.params
          return { content: [{ type: 'text' as const, text: `echo:${String(ctx.params)}` }] }
        },
      }

      registry.register(execTool)
      const tool = registry.get('echo')
      const result = await tool!.execute({
        id: 'call-1',
        params: 'hello',
        signal: new AbortController().signal,
      })

      expect(received).toBe('hello')
      expect(result.content[0]?.type).toBe('text')
      expect(result.content[0]?.text).toBe('echo:hello')
    })

    it('#then getAvailable tools are executable', async () => {
      const registry = new ToolRegistry()

      const standardTool: AgentTool = {
        name: 'std-exec',
        description: 'standard executable tool',
        parameters: {
          safeParse(input: unknown) {
            return { success: true as const, data: input }
          },
        } as never,
        execute: async () => ({ content: [{ type: 'text' as const, text: 'ran' }] }),
      }

      registry.register(standardTool, { preset: 'standard' })
      const available = registry.getAvailable('standard')
      const result = await available[0]!.execute({
        id: 'call-2',
        params: {},
        signal: new AbortController().signal,
      })

      expect(available).toHaveLength(1)
      expect(available[0]?.name).toBe('std-exec')
      expect(result.content[0]?.text).toBe('ran')
    })
  })

  describe('#buildToolGuidance', () => {
    it('#then includes guideline text for tools with guideline', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), {
        preset: 'minimal',
        guideline: 'Always read before editing.',
      })

      const guidance = registry.buildToolGuidance('minimal')
      expect(guidance).toContain('### Tool Usage Guidelines')
      expect(guidance).toContain('#### read')
      expect(guidance).toContain('Always read before editing.')
    })

    it('#then includes snippet when provided', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('bash'), {
        preset: 'minimal',
        snippet: 'bash ls -la',
      })

      const guidance = registry.buildToolGuidance('minimal')
      expect(guidance).toContain('#### bash')
      expect(guidance).toContain('bash ls -la')
      expect(guidance).toContain('Example')
    })

    it('#then falls back to tool description when no guideline or snippet', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('custom_tool'), { preset: 'minimal' })

      const guidance = registry.buildToolGuidance('minimal')
      expect(guidance).toContain('#### custom_tool')
      expect(guidance).toContain('Tool: custom_tool')
    })

    it('#then respects preset filtering', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('a'), { preset: 'minimal', guideline: 'A tip' })
      registry.register(makeTool('b'), { preset: 'full', guideline: 'B tip' })

      const minGuidance = registry.buildToolGuidance('minimal')
      expect(minGuidance).toContain('#### a')
      expect(minGuidance).not.toContain('#### b')

      const fullGuidance = registry.buildToolGuidance('full')
      expect(fullGuidance).toContain('#### a')
      expect(fullGuidance).toContain('#### b')
    })

    it('#then returns empty string for empty registry', () => {
      const registry = new ToolRegistry()
      expect(registry.buildToolGuidance('minimal')).toBe('')
    })
  })

  describe('#buildToolAvailability', () => {
    it('#then describes active, deferred, and category coverage', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), { preset: 'minimal', category: 'fs' })
      registry.register(makeTool('web_search'), {
        preset: 'standard',
        category: 'web',
        shouldDefer: true,
      })

      const availability = registry.buildToolAvailability('standard')

      expect(availability).toContain('### Tool Availability')
      expect(availability).toContain('Active tool schemas: read')
      expect(availability).toContain('Deferred tools: web_search')
      expect(availability).toContain('- fs: read')
      expect(availability).toContain('- web: web_search')
    })
  })

  describe('#buildDeferredToolsGuidance', () => {
    it('#then documents tool_search flow without full schemas', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('web_search'), {
        preset: 'standard',
        category: 'web',
        shouldDefer: true,
      })

      const guidance = registry.buildDeferredToolsGuidance('standard')

      expect(guidance).toContain('### Deferred Tools')
      expect(guidance).toContain('Use `tool_search`')
      expect(guidance).toContain('select:<tool_name>')
      expect(guidance).toContain('- web_search [web]: Tool: web_search')
      expect(guidance).not.toContain('parameters')
    })

    it('#then returns empty string when no deferred tools are available', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), { preset: 'minimal', category: 'fs' })

      expect(registry.buildDeferredToolsGuidance('minimal')).toBe('')
    })
  })

  describe('#getMetadataCoverage', () => {
    it('#then reports full coverage for complete builtin metadata', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('read'), {
        preset: 'minimal',
        category: 'fs',
        builtin: true,
        guideline: 'Read files before editing.',
      })

      expect(registry.getMetadataCoverage('minimal')).toEqual({
        total: 1,
        covered: 1,
        percent: 100,
        issues: [],
      })
    })

    it('#then reports missing builtin category or guidance', () => {
      const registry = new ToolRegistry()
      registry.register(
        {
          ...makeTool('bare'),
          description: '',
        },
        {
          preset: 'minimal',
          builtin: true,
        },
      )

      const coverage = registry.getMetadataCoverage('minimal')

      expect(coverage.percent).toBe(0)
      expect(coverage.issues).toEqual([
        { toolName: 'bare', missing: ['category', 'guidance'] },
      ])
    })
  })
})
