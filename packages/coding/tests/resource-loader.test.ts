import { describe, expect, it } from 'vitest'
import {
  createInMemoryResourceLoader,
} from '../src/resource-loader'
import type { PromptTemplate, LoadedResources } from '../src/resource-loader'
import type { Skill } from '../src/skill'

// ═══ ResourceLoader ═══

describe('ResourceLoader', () => {
  describe('InMemoryResourceLoader', () => {
    it('loads empty resources by default', async () => {
      const loader = createInMemoryResourceLoader()
      const resources = await loader.load()

      expect(resources.agentInstructions).toBe('')
      expect(resources.skills).toEqual([])
      expect(resources.promptTemplates).toEqual([])
      expect(resources.diagnostics).toEqual([])
      expect(resources.memories.size).toBe(0)
    })

    it('loads provided memories', async () => {
      const memories = new Map<string, string>()
      memories.set('~/.vitamin/AGENTS.md', '# Global instructions\nBe helpful.')
      memories.set('./.vitamin/AGENTS.md', '# Project notes\nUse TypeScript.')

      const loader = createInMemoryResourceLoader({ memories })
      const resources = await loader.load()

      expect(resources.agentInstructions).toContain('<agent_memory>')
      expect(resources.agentInstructions).toContain('Be helpful.')
      expect(resources.agentInstructions).toContain('Use TypeScript.')
      expect(resources.memories.size).toBe(2)
    })

    it('loads provided skills', async () => {
      const skills: Skill[] = [
        {
          name: 'test-skill',
          description: 'A test skill',
          filePath: '/test/SKILL.md',
          directory: '/test',
          body: '# Test Skill\nDo something.',
          source: 'project',
          disableModelInvocation: false,
        },
      ]

      const loader = createInMemoryResourceLoader({ skills })
      const resources = await loader.load()

      expect(resources.skills).toHaveLength(1)
      expect(resources.skills[0].name).toBe('test-skill')
      expect(resources.skillsPromptInjection).toContain('test-skill')
      expect(resources.skillsPromptInjection).toContain('<available_skills>')
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

      const loader = createInMemoryResourceLoader({ promptTemplates })
      const resources = await loader.load()

      expect(resources.promptTemplates).toHaveLength(1)
      expect(resources.promptTemplates[0].name).toBe('code-review')
      expect(resources.promptTemplates[0].content).toContain('Code Review')
    })

    it('exposes resources via getter after load', async () => {
      const loader = createInMemoryResourceLoader()
      expect(loader.resources).toBeNull()

      await loader.load()
      expect(loader.resources).not.toBeNull()
      expect(loader.resources!.diagnostics).toEqual([])
    })

    it('reload returns fresh resources', async () => {
      const memories = new Map([['test', 'content']])
      const loader = createInMemoryResourceLoader({ memories })

      const first = await loader.load()
      const second = await loader.reload()

      expect(first.agentInstructions).toBe(second.agentInstructions)
    })

    it('onChange registers and unregisters callbacks', async () => {
      const loader = createInMemoryResourceLoader()
      const events: LoadedResources[] = []
      const unsub = loader.onChange((r) => events.push(r))

      // InMemoryResourceLoader doesn't actively trigger onChange
      // but the callback should register/unregister cleanly
      unsub()
    })

    it('dispose clears state', async () => {
      const loader = createInMemoryResourceLoader()
      await loader.load()
      expect(loader.resources).not.toBeNull()

      loader.dispose()
      expect(loader.resources).toBeNull()
    })

    it('skills prompt injection excludes disableModelInvocation skills', async () => {
      const skills: Skill[] = [
        {
          name: 'visible-skill',
          description: 'Visible',
          filePath: '/skills/visible/SKILL.md',
          directory: '/skills/visible',
          body: 'visible body',
          source: 'project',
          disableModelInvocation: false,
        },
        {
          name: 'hidden-skill',
          description: 'Hidden',
          filePath: '/skills/hidden/SKILL.md',
          directory: '/skills/hidden',
          body: 'hidden body',
          source: 'project',
          disableModelInvocation: true,
        },
      ]

      const loader = createInMemoryResourceLoader({ skills })
      const resources = await loader.load()

      expect(resources.skills).toHaveLength(2)
      expect(resources.skillsPromptInjection).toContain('visible-skill')
      expect(resources.skillsPromptInjection).not.toContain('hidden-skill')
    })
  })
})
