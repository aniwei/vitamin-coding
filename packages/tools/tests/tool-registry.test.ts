// @vitamin/tools ToolRegistry 测试
import { describe, expect, it } from 'vitest'
import { createToolRegistry } from '../src/tool-registry'

import type { AgentTool } from '@vitamin/agent'

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
      const registry = createToolRegistry()
      expect(registry.size).toBe(0)
    })

    it('#then getAll returns empty', () => {
      const registry = createToolRegistry()
      expect(registry.getAll()).toHaveLength(0)
    })
  })

  describe('#when register() is called', () => {
    it('#then tool is retrievable by name', () => {
      const registry = createToolRegistry()
      registry.register(makeTool('read'), {
        preset: 'minimal',
        category: 'filesystem',
        builtin: true,
      })
      expect(registry.has('read')).toBe(true)
      expect(registry.get('read')?.name).toBe('read')
      expect(registry.size).toBe(1)
    })
  })

  describe('#when unregister() is called', () => {
    it('#then tool is removed', () => {
      const registry = createToolRegistry()
      registry.register(makeTool('read'))
      expect(registry.has('read')).toBe(true)
      registry.unregister('read')
      expect(registry.has('read')).toBe(false)
      expect(registry.size).toBe(0)
    })

    it('#then returns false for unknown tool', () => {
      const registry = createToolRegistry()
      expect(registry.unregister('nonexistent')).toBe(false)
    })
  })

  describe('#given tools with different presets', () => {
    function setupRegistry() {
      const registry = createToolRegistry()
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
      const registry = createToolRegistry()
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
      const registry = createToolRegistry()
      registry.register(makeTool('read'), { builtin: true })
      registry.register(makeTool('custom'), { builtin: false })

      const builtins = registry.getBuiltin()
      expect(builtins).toHaveLength(1)
      expect(builtins[0]?.name).toBe('read')
    })
  })

  describe('#when filterByNames() is called', () => {
    it('#then returns only named tools', () => {
      const registry = createToolRegistry()
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      registry.register(makeTool('c'))

      const filtered = registry.filterByNames(['a', 'c'])
      expect(filtered).toHaveLength(2)
    })
  })

  describe('#when excludeByNames() is called', () => {
    it('#then excludes named tools', () => {
      const registry = createToolRegistry()
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
      const registry = createToolRegistry()
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      expect(registry.size).toBe(2)

      registry.clear()
      expect(registry.size).toBe(0)
    })
  })
})
