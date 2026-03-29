import { describe, expect, it } from 'vitest'
import {
  createInMemoryResourceManager,
} from '../src/resources/resource-manager'
import type { PromptTemplate, LoadedResources } from '../src/resources/resource-manager'

// ═══ ResourceManager ═══

describe('ResourceManager', () => {
  describe('InMemoryResourceManager', () => {
    it('loads empty resources by default', async () => {
      const loader = createInMemoryResourceManager()
      const resources = await loader.load()

      expect(resources.agentInstructions).toBe('')
      expect(resources.promptTemplates).toEqual([])
      expect(resources.diagnostics).toEqual([])
      expect(resources.memories.size).toBe(0)
    })

    it('loads provided memories', async () => {
      const memories = new Map<string, string>()
      memories.set('~/.vitamin/AGENTS.md', '# Global instructions\nBe helpful.')
      memories.set('./.vitamin/AGENTS.md', '# Project notes\nUse TypeScript.')

      const loader = createInMemoryResourceManager({ memories })
      const resources = await loader.load()

      expect(resources.agentInstructions).toContain('<agent_memory>')
      expect(resources.agentInstructions).toContain('Be helpful.')
      expect(resources.agentInstructions).toContain('Use TypeScript.')
      expect(resources.memories.size).toBe(2)
    })

    it('loads provided prompt templates', async () => {
      const promptTemplates: PromptTemplate[] = [
        {
          name: 'code-review',
          content: '# Code Review\nPlease review the following code.',
          filePath: '/prompts/code-review.md',
          source: 'project',
        },
      ]

      const loader = createInMemoryResourceManager({ promptTemplates })
      const resources = await loader.load()
      const [template] = resources.promptTemplates

      expect(resources.promptTemplates).toHaveLength(1)
      expect(template).toBeDefined()
      expect(template?.name).toBe('code-review')
      expect(template?.content).toContain('Code Review')
    })

    it('exposes resources via getter after load', async () => {
      const loader = createInMemoryResourceManager()
      expect(loader.resources).toBeNull()

      await loader.load()
      expect(loader.resources).not.toBeNull()
      expect(loader.resources!.diagnostics).toEqual([])
    })

    it('reload returns fresh resources', async () => {
      const memories = new Map([['test', 'content']])
      const loader = createInMemoryResourceManager({ memories })

      const first = await loader.load()
      const second = await loader.reload()

      expect(first.agentInstructions).toBe(second.agentInstructions)
    })

    it('onChange registers and unregisters callbacks', async () => {
      const loader = createInMemoryResourceManager()
      const events: LoadedResources[] = []
      const unsub = loader.onChange((r) => events.push(r))

      expect(events).toEqual([])
      unsub()
    })

    it('dispose clears state', async () => {
      const loader = createInMemoryResourceManager()
      await loader.load()
      expect(loader.resources).not.toBeNull()

      loader.dispose()
      expect(loader.resources).toBeNull()
    })
  })
})
