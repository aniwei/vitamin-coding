import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHookRegistry } from '@vitamin/hooks'

import { PluginManager, importPluginTool } from '../src/plugin-manager'
import { ToolRegistry } from '../src/tool-registry'

async function createPlugin(root: string, id: string, manifest: object, moduleSource?: string) {
  const dir = join(root, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'plugin.json'), JSON.stringify(manifest), 'utf-8')
  if (moduleSource) {
    await mkdir(join(dir, 'tools'), { recursive: true })
    await writeFile(join(dir, 'tools', 'hello.js'), moduleSource, 'utf-8')
  }
  return dir
}

const toolModule = `
import { z } from 'zod'

export const helloTool = {
  name: 'plugin_hello',
  description: 'Say hello from plugin',
  parameters: z.object({ name: z.string().optional() }),
  readonly: true,
  async execute() {
    return { content: [{ type: 'text', text: 'hello' }] }
  },
}
`

const hookModule = `
export default {
  name: 'plugin-message-hook',
  timing: 'chat.message.before',
  priority: 10,
  enabled: true,
  kind: 'interceptor',
  handle(input, output) {
    output.metadata = { ...output.metadata, pluginHook: true }
  },
}
`

describe('PluginManager', () => {
  it('#then loads plugin tools from modules and stores plugin metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(
      root,
      'hello-plugin',
      {
        id: 'hello-plugin',
        name: 'Hello Plugin',
        version: '1.0.0',
        tools: [
          {
            name: 'plugin_hello',
            module: './tools/hello.js',
            exportName: 'helloTool',
            category: 'hello',
            preset: 'standard',
            shouldDefer: true,
          },
        ],
      },
      toolModule,
    )

    const registry = new ToolRegistry()
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    const diagnostics = await manager.loadAll()

    expect(diagnostics.errors).toEqual([])
    expect(registry.get('plugin_hello')?.metadata).toMatchObject({
      pluginId: 'hello-plugin',
      category: 'hello',
      preset: 'standard',
      shouldDefer: true,
    })
  })

  it('#then does not block other plugins when one plugin module is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(
      root,
      'good-plugin',
      {
        id: 'good-plugin',
        name: 'Good Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', exportName: 'helloTool' }],
      },
      toolModule,
    )
    await createPlugin(root, 'bad-plugin', {
      id: 'bad-plugin',
      name: 'Bad Plugin',
      version: '1.0.0',
      tools: [{ name: 'missing_tool', module: './tools/missing.js' }],
    })

    const registry = new ToolRegistry()
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    const diagnostics = await manager.loadAll()

    expect(registry.has('plugin_hello')).toBe(true)
    expect(diagnostics.errors.some((error) => error.includes('missing_tool'))).toBe(true)
  })

  it('#then unloadAll removes only plugin-owned tools', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(
      root,
      'hello-plugin',
      {
        id: 'hello-plugin',
        name: 'Hello Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', exportName: 'helloTool' }],
      },
      toolModule,
    )

    const registry = new ToolRegistry()
    registry.register({
      name: 'host_tool',
      description: 'Host tool',
      parameters: z.object({}),
      async execute() {
        return { content: [{ type: 'text' as const, text: 'host' }] }
      },
    })
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    await manager.loadAll()
    await manager.unloadAll()

    expect(registry.has('plugin_hello')).toBe(false)
    expect(registry.has('host_tool')).toBe(true)
  })

  it('#then rejects tool modules outside plugin root', async () => {
    await expect(
      importPluginTool('/tmp/plugin-root', { name: 'escape', module: '../escape.js' }),
    ).rejects.toThrow('inside plugin root')
  })

  it('#then skips dangerous plugins until trusted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(
      root,
      'shell-plugin',
      {
        id: 'shell-plugin',
        name: 'Shell Plugin',
        version: '1.0.0',
        permissions: ['shell'],
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', exportName: 'helloTool' }],
      },
      toolModule,
    )

    const registry = new ToolRegistry()
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    const diagnostics = await manager.loadAll()

    expect(registry.has('plugin_hello')).toBe(false)
    expect(diagnostics.loaded).toHaveLength(0)
    expect(diagnostics.discovered[0]?.manifest?.id).toBe('shell-plugin')
  })

  it('#then loads and unloads trusted plugin hooks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    const pluginDir = await createPlugin(root, 'hook-plugin', {
      id: 'hook-plugin',
      name: 'Hook Plugin',
      version: '1.0.0',
      hooks: [
        {
          name: 'plugin-message-hook',
          timing: 'chat.message.before',
          module: './hooks/message-hook.js',
        },
      ],
    })
    await mkdir(join(pluginDir, 'hooks'), { recursive: true })
    await writeFile(join(pluginDir, 'hooks', 'message-hook.js'), hookModule, 'utf-8')

    const registry = new ToolRegistry()
    const hooks = createHookRegistry({ preset: 'none' })
    const manager = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      hookRegistry: hooks,
      trustedPluginIds: ['hook-plugin'],
    })

    await manager.loadAll()

    expect(hooks.has('plugin-message-hook')).toBe(true)

    manager.disable('hook-plugin')

    expect(hooks.has('plugin-message-hook')).toBe(false)
  })
})
