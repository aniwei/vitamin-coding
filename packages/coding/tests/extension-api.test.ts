import { describe, expect, it } from 'vitest'
import { createHookRegistry } from '@vitamin/hooks'
import { ExtensionManager, createExtensionManager } from '../src/extension-api'
import type { ExtensionModule, ExtensionAPI } from '../src/extension-api'
import { z } from 'zod'
import type { AgentTool } from '@vitamin/agent'

// ═══ ExtensionManager ═══

function makeTool(name: string): AgentTool {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: z.object({}),
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
  }
}

describe('ExtensionManager', () => {
  it('creates via factory', () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = createExtensionManager(hooks)
    expect(mgr).toBeInstanceOf(ExtensionManager)
  })

  it('activates an extension that registers tools', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    const ext: ExtensionModule = {
      descriptor: { name: 'test-ext', version: '1.0.0' },
      activate: (api: ExtensionAPI) => {
        api.registerTool(makeTool('ext-read'))
        api.registerTool(makeTool('ext-write'))
      },
    }

    const loaded = await mgr.activate(ext)

    expect(loaded.descriptor.name).toBe('test-ext')
    expect(loaded.tools).toHaveLength(2)
    expect(loaded.tools[0].name).toBe('ext-read')
  })

  it('activates an extension that registers hooks', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    const hookCalled: string[] = []

    const ext: ExtensionModule = {
      descriptor: { name: 'hook-ext' },
      activate: (api) => {
        api.registerHook({
          name: 'hook-ext:stream.start',
          timing: 'stream.start',
          priority: 100,
          enabled: true,
          handler: (input) => {
            hookCalled.push(input.model)
          },
        })
      },
    }

    await mgr.activate(ext)

    // Verify hook was registered on the HookRegistry
    await hooks.emit('stream.start', { sessionId: 'test', model: 'gpt-4' })
    expect(hookCalled).toEqual(['gpt-4'])
  })

  it('activates an extension that registers prompts', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    const ext: ExtensionModule = {
      descriptor: { name: 'prompt-ext' },
      activate: (api) => {
        api.registerPrompt({
          name: 'debug-template',
          content: '# Debug\nPlease debug this issue.',
          filePath: '/ext/prompts/debug.md',
          source: 'project',
        })
      },
    }

    const loaded = await mgr.activate(ext)

    expect(loaded.prompts).toHaveLength(1)
    expect(loaded.prompts[0].name).toBe('debug-template')
  })

  it('handles async activate', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    const ext: ExtensionModule = {
      descriptor: { name: 'async-ext' },
      activate: async (api) => {
        await new Promise(r => setTimeout(r, 10))
        api.registerTool(makeTool('async-tool'))
      },
    }

    const loaded = await mgr.activate(ext)
    expect(loaded.tools).toHaveLength(1)
  })

  it('list returns all loaded extensions', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    await mgr.activate({
      descriptor: { name: 'ext-a' },
      activate: () => {},
    })
    await mgr.activate({
      descriptor: { name: 'ext-b' },
      activate: (api) => api.registerTool(makeTool('b-tool')),
    })

    const list = mgr.list()
    expect(list).toHaveLength(2)
    expect(list.map(e => e.descriptor.name)).toEqual(['ext-a', 'ext-b'])
  })

  it('get returns a specific extension', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    await mgr.activate({
      descriptor: { name: 'my-ext' },
      activate: (api) => api.registerTool(makeTool('my-tool')),
    })

    expect(mgr.get('my-ext')).toBeDefined()
    expect(mgr.get('my-ext')!.tools).toHaveLength(1)
    expect(mgr.get('nonexistent')).toBeUndefined()
  })

  it('getAllTools aggregates tools from all extensions', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    await mgr.activate({
      descriptor: { name: 'ext-1' },
      activate: (api) => {
        api.registerTools([makeTool('tool-a'), makeTool('tool-b')])
      },
    })
    await mgr.activate({
      descriptor: { name: 'ext-2' },
      activate: (api) => api.registerTool(makeTool('tool-c')),
    })

    const all = mgr.getAllTools()
    expect(all).toHaveLength(3)
    expect(all.map(t => t.name)).toEqual(['tool-a', 'tool-b', 'tool-c'])
  })

  it('getAllPrompts aggregates prompts from all extensions', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    await mgr.activate({
      descriptor: { name: 'ext-p1' },
      activate: (api) => {
        api.registerPrompt({ name: 'p1', content: 'c1', filePath: '/p1.md', source: 'user' })
      },
    })
    await mgr.activate({
      descriptor: { name: 'ext-p2' },
      activate: (api) => {
        api.registerPrompt({ name: 'p2', content: 'c2', filePath: '/p2.md', source: 'project' })
      },
    })

    const all = mgr.getAllPrompts()
    expect(all).toHaveLength(2)
    expect(all.map(p => p.name)).toEqual(['p1', 'p2'])
  })

  it('provides descriptor in API context', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)
    let capturedDescriptor: unknown

    await mgr.activate({
      descriptor: { name: 'desc-ext', version: '2.0' },
      activate: (api) => {
        capturedDescriptor = api.descriptor
      },
    })

    expect(capturedDescriptor).toEqual({ name: 'desc-ext', version: '2.0' })
  })

  it('uses default descriptor when none provided', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    const loaded = await mgr.activate({
      activate: () => {},
    })

    expect(loaded.descriptor.name).toBe('unknown')
  })

  it('dispose clears all loaded extensions', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const mgr = new ExtensionManager(hooks)

    await mgr.activate({
      descriptor: { name: 'disposable' },
      activate: () => {},
    })

    expect(mgr.list()).toHaveLength(1)
    mgr.dispose()
    expect(mgr.list()).toHaveLength(0)
  })
})
