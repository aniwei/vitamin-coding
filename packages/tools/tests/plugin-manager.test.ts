import { access, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
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
    const manager = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      trustedPluginIds: ['hello-plugin'],
    })

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
    const manager = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      trustedPluginIds: ['good-plugin', 'bad-plugin'],
    })

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
    const manager = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      trustedPluginIds: ['hello-plugin'],
    })

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

  it('#then rejects symlinked tool modules that resolve outside plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugin-root-'))
    const pluginDir = join(root, 'escape-plugin')
    const outsideDir = await mkdtemp(join(tmpdir(), 'vitamin-plugin-outside-'))
    await mkdir(join(pluginDir, 'tools'), { recursive: true })
    const outsideModule = join(outsideDir, 'escape.js')
    await writeFile(outsideModule, toolModule, 'utf-8')
    await symlink(outsideModule, join(pluginDir, 'tools', 'escape.js'))

    await expect(
      importPluginTool(pluginDir, {
        name: 'plugin_hello',
        module: './tools/escape.js',
        exportName: 'helloTool',
      }),
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

  it('#then does not import dynamic tool modules until trusted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    const sideEffectFile = join(root, 'side-effect.txt')
    await createPlugin(
      root,
      'dynamic-plugin',
      {
        id: 'dynamic-plugin',
        name: 'Dynamic Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', exportName: 'helloTool' }],
      },
      `
import { writeFileSync } from 'node:fs'
import { z } from 'zod'

writeFileSync(${JSON.stringify(sideEffectFile)}, 'imported')

export const helloTool = {
  name: 'plugin_hello',
  description: 'Say hello from plugin',
  parameters: z.object({}),
  readonly: true,
  async execute() {
    return { content: [{ type: 'text', text: 'hello' }] }
  },
}
`,
    )

    const registry = new ToolRegistry()
    const untrusted = new PluginManager({ roots: [root], toolRegistry: registry })

    const untrustedDiagnostics = await untrusted.loadAll()

    expect(registry.has('plugin_hello')).toBe(false)
    expect(untrustedDiagnostics.loaded).toHaveLength(0)
    expect(untrustedDiagnostics.discovered[0]?.manifest?.id).toBe('dynamic-plugin')
    await expect(access(sideEffectFile)).rejects.toThrow()

    const trusted = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      trustedPluginIds: ['dynamic-plugin'],
    })

    await trusted.loadAll()

    expect(registry.has('plugin_hello')).toBe(true)
    await expect(access(sideEffectFile)).resolves.toBeUndefined()
  })

  it('#then untrust unloads plugin capabilities without marking the plugin disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(
      root,
      'dynamic-plugin',
      {
        id: 'dynamic-plugin',
        name: 'Dynamic Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', exportName: 'helloTool' }],
      },
      toolModule,
    )

    const registry = new ToolRegistry()
    const manager = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      trustedPluginIds: ['dynamic-plugin'],
    })
    await manager.loadAll()

    await manager.untrust('dynamic-plugin')

    expect(registry.has('plugin_hello')).toBe(false)
    expect(manager.getState()).toEqual({
      trustedPluginIds: [],
      disabledPluginIds: [],
    })
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

    await manager.disable('hook-plugin')

    expect(hooks.has('plugin-message-hook')).toBe(false)
  })

  it('#then loads and unloads plugin skills and mcp servers through lifecycle adapters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    const pluginDir = await createPlugin(root, 'capability-plugin', {
      id: 'capability-plugin',
      name: 'Capability Plugin',
      version: '1.0.0',
      skills: [{ name: 'code-review', path: './skills/code-review/SKILL.md', trigger: 'manual' }],
      mcpServers: [{ name: 'docs', command: 'node', args: ['server.mjs'] }],
      commands: [{ name: 'review', description: 'Run review command' }],
      agents: [{ name: 'reviewer', description: 'Review agent' }],
      devtools: {
        panels: [{ name: 'review-panel', title: 'Review Panel' }],
        providers: [{ name: 'review-diagnostics', kind: 'diagnostics' }],
        actions: [{ name: 'rerun-review', title: 'Rerun Review' }],
      },
      logs: {
        sinks: [{ name: 'review-sink', kind: 'memory' }],
        formatters: [{ name: 'review-json' }],
        viewers: [{ name: 'review-logs', title: 'Review Logs' }],
      },
    })
    await mkdir(join(pluginDir, 'skills/code-review'), { recursive: true })
    await writeFile(
      join(pluginDir, 'skills/code-review/SKILL.md'),
      '---\nname: code-review\ndescription: Review code\n---\nReview code.\n',
      'utf-8',
    )

    const calls: string[] = []
    const registry = new ToolRegistry()
    const manager = new PluginManager({
      roots: [root],
      toolRegistry: registry,
      trustedPluginIds: ['capability-plugin'],
      lifecycleAdapters: {
        loadSkill: async (skill, pluginId) => {
          calls.push(`load-skill:${pluginId}:${skill.name}:${skill.path.endsWith('SKILL.md')}`)
        },
        unloadSkill: async (skill, pluginId) => {
          calls.push(`unload-skill:${pluginId}:${skill.name}`)
        },
        connectMcpServer: async (name, config, pluginId) => {
          calls.push(`connect-mcp:${pluginId}:${name}:${config.command}`)
        },
        disconnectMcpServer: async (name, pluginId) => {
          calls.push(`disconnect-mcp:${pluginId}:${name}`)
        },
        registerCommand: async (command, pluginId) => {
          calls.push(`register-command:${pluginId}:${command.name}`)
        },
        unregisterCommand: async (command, pluginId) => {
          calls.push(`unregister-command:${pluginId}:${command.name}`)
        },
        registerAgent: async (agent, pluginId) => {
          calls.push(`register-agent:${pluginId}:${agent.name}`)
        },
        unregisterAgent: async (agent, pluginId) => {
          calls.push(`unregister-agent:${pluginId}:${agent.name}`)
        },
        registerDevtools: async (contribution, pluginId) => {
          calls.push(`register-devtools:${pluginId}:${contribution.panels?.[0]?.name}`)
        },
        unregisterDevtools: async (pluginId) => {
          calls.push(`unregister-devtools:${pluginId}`)
        },
        registerLogs: async (contribution, pluginId) => {
          calls.push(`register-logs:${pluginId}:${contribution.sinks?.[0]?.name}`)
        },
        unregisterLogs: async (pluginId) => {
          calls.push(`unregister-logs:${pluginId}`)
        },
      },
    })

    const diagnostics = await manager.loadAll()

    expect(diagnostics.results[0]?.steps).toEqual([
      { type: 'skill', name: 'code-review', status: 'loaded' },
      { type: 'mcp', name: 'docs', status: 'loaded' },
      { type: 'command', name: 'review', status: 'loaded' },
      { type: 'agent', name: 'reviewer', status: 'loaded' },
      { type: 'devtools', name: 'devtools', status: 'loaded' },
      { type: 'log', name: 'logs', status: 'loaded' },
    ])

    await manager.disable('capability-plugin')

    expect(calls).toEqual([
      'load-skill:capability-plugin:code-review:true',
      'connect-mcp:capability-plugin:docs:node',
      'register-command:capability-plugin:review',
      'register-agent:capability-plugin:reviewer',
      'register-devtools:capability-plugin:review-panel',
      'register-logs:capability-plugin:review-sink',
      'unload-skill:capability-plugin:code-review',
      'disconnect-mcp:capability-plugin:docs',
      'unregister-command:capability-plugin:review',
      'unregister-agent:capability-plugin:reviewer',
      'unregister-devtools:capability-plugin',
      'unregister-logs:capability-plugin',
    ])
  })

  it('#then skips log contributions until trusted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(root, 'log-plugin', {
      id: 'log-plugin',
      name: 'Log Plugin',
      version: '1.0.0',
      logs: {
        sinks: [{ name: 'audit-sink', kind: 'memory' }],
      },
    })

    const registry = new ToolRegistry()
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    const diagnostics = await manager.loadAll()

    expect(diagnostics.loaded).toHaveLength(0)
    expect(diagnostics.results[0]?.steps).toEqual([
      {
        type: 'log',
        name: 'logs',
        status: 'skipped',
        warning: 'plugin requires trust before loading dynamic code or dangerous permissions',
      },
    ])
  })

  it('#then skips devtools contributions until trusted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(root, 'devtools-plugin', {
      id: 'devtools-plugin',
      name: 'Devtools Plugin',
      version: '1.0.0',
      devtools: {
        panels: [{ name: 'trace-panel', title: 'Trace Panel' }],
      },
    })

    const registry = new ToolRegistry()
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    const diagnostics = await manager.loadAll()

    expect(diagnostics.loaded).toHaveLength(0)
    expect(diagnostics.results[0]?.steps).toEqual([
      {
        type: 'devtools',
        name: 'devtools',
        status: 'skipped',
        warning: 'plugin requires trust before loading dynamic code or dangerous permissions',
      },
    ])
  })

  it('#then reports plugin commands and agents as skipped until adapters exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugins-'))
    await createPlugin(root, 'declarations-plugin', {
      id: 'declarations-plugin',
      name: 'Declarations Plugin',
      version: '1.0.0',
      commands: [{ name: 'review', description: 'Run review command' }],
      agents: [{ name: 'reviewer', description: 'Review agent' }],
    })

    const registry = new ToolRegistry()
    const manager = new PluginManager({ roots: [root], toolRegistry: registry })

    const diagnostics = await manager.loadAll()

    expect(diagnostics.results).toHaveLength(1)
    expect(diagnostics.results[0]?.steps).toEqual([
      {
        type: 'command',
        name: 'review',
        status: 'skipped',
        warning: 'command adapter is not configured',
      },
      {
        type: 'agent',
        name: 'reviewer',
        status: 'skipped',
        warning: 'agent adapter is not configured',
      },
    ])
  })
})
