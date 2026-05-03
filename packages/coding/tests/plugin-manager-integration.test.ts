import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFilePluginStateStore } from '@x-mars/tools'
import type { McpManager } from '@x-mars/tools'
import type { SkillProvider } from '@x-mars/skill'
import { getPluginLogSinkEntries, listPluginLogContributions } from '@x-mars/shared'

import { createXMars } from '../src/app/x-mars-app'

const toolModule = `
import { z } from 'zod'

export default {
  name: 'plugin_hello',
  description: 'Say hello from plugin',
  parameters: z.object({}),
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
  handle(input, output) {
    output.metadata = { ...output.metadata, pluginHook: input.sessionId }
  },
}
`

describe('XMarsApp plugin manager integration', () => {
  it('#then loads plugin tools on start and unloads them on stop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-plugins-'))
    const pluginDir = join(root, 'hello-plugin')
    await mkdir(join(pluginDir, 'tools'), { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'hello-plugin',
        name: 'Hello Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', category: 'plugin' }],
      }),
      'utf-8',
    )
    await writeFile(join(pluginDir, 'tools', 'hello.js'), toolModule, 'utf-8')

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
      trustedPluginIds: ['hello-plugin'],
    })

    await app.start()

    expect(app.toolRegistry.get('plugin_hello')?.metadata.pluginId).toBe('hello-plugin')
    expect(app.tools.some((tool) => tool.name === 'plugin_hello')).toBe(true)

    await app.stop()

    expect(app.toolRegistry.has('plugin_hello')).toBe(false)
  })

  it('#then loads plugin trust state from the configured plugin state store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-plugin-state-'))
    const pluginDir = join(root, '.x-mars/plugins/hello-plugin')
    await mkdir(join(pluginDir, 'tools'), { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'hello-plugin',
        name: 'Hello Plugin',
        version: '1.0.0',
        tools: [{ name: 'plugin_hello', module: './tools/hello.js', category: 'plugin' }],
      }),
      'utf-8',
    )
    await writeFile(join(pluginDir, 'tools', 'hello.js'), toolModule, 'utf-8')

    const pluginStateStore = createFilePluginStateStore({ workspaceDir: root })
    await pluginStateStore.trust('hello-plugin')

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [join(root, '.x-mars/plugins')],
      pluginStateStore,
    })

    await app.start()

    expect(app.toolRegistry.get('plugin_hello')?.metadata.pluginId).toBe('hello-plugin')

    await app.stop()
  })

  it('#then loads plugin hooks through XMarsApp and unloads them on stop', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-hook-plugins-'))
    const pluginDir = join(root, 'hook-plugin')
    await mkdir(join(pluginDir, 'hooks'), { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
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
      }),
      'utf-8',
    )
    await writeFile(join(pluginDir, 'hooks', 'message-hook.js'), hookModule, 'utf-8')

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
      trustedPluginIds: ['hook-plugin'],
    })

    await app.start()

    expect(app.hookRegistry.has('plugin-message-hook')).toBe(true)

    const output = {
      message: { role: 'user' as const, content: 'hello' },
      cancelled: false,
      metadata: {},
    }
    await app.hookRegistry.execute(
      'chat.message.before',
      {
        message: { role: 'user' as const, content: 'hello' },
        sessionId: 'session-1',
        isFirstMessage: true,
        metadata: {},
      },
      output,
    )

    expect(output.metadata).toMatchObject({ pluginHook: 'session-1' })

    await app.stop()

    expect(app.hookRegistry.has('plugin-message-hook')).toBe(false)
  })

  it('#then wires plugin skill and mcp lifecycle adapters through XMarsApp', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-capability-plugins-'))
    const pluginDir = join(root, 'capability-plugin')
    await mkdir(join(pluginDir, 'skills/code-review'), { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'capability-plugin',
        name: 'Capability Plugin',
        version: '1.0.0',
        skills: [{ name: 'code-review', path: './skills/code-review/SKILL.md', trigger: 'manual' }],
        mcpServers: [{ name: 'docs', command: 'node', args: ['server.mjs'] }],
      }),
      'utf-8',
    )
    await writeFile(
      join(pluginDir, 'skills/code-review/SKILL.md'),
      '---\nname: code-review\ndescription: Review code\n---\nReview code.\n',
      'utf-8',
    )

    const calls: string[] = []
    const skillProvider: SkillProvider = {
      async load(path) {
        calls.push(`skill-load:${path.endsWith('SKILL.md')}`)
        return { success: true, name: 'code-review' }
      },
      async unload(name) {
        calls.push(`skill-unload:${name}`)
        return { success: true }
      },
      async execute() {
        return { success: true, content: 'ok' }
      },
    }
    const mcpManager = {
      async connect(name: string) {
        calls.push(`mcp-connect:${name}`)
      },
      async disconnect(name: string) {
        calls.push(`mcp-disconnect:${name}`)
      },
      getServerInstructions() {
        return []
      },
    } as unknown as McpManager

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
      trustedPluginIds: ['capability-plugin'],
      skillProvider,
      mcpManager,
    })

    await app.start()
    await app.stop()

    expect(calls).toEqual([
      'skill-load:true',
      'mcp-connect:capability-plugin:docs',
      'skill-unload:code-review',
      'mcp-disconnect:capability-plugin:docs',
    ])
  })

  it('#then wires plugin command and agent registries through XMarsApp', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-command-agent-plugins-'))
    const pluginDir = join(root, 'command-agent-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'command-agent-plugin',
        name: 'Command Agent Plugin',
        version: '1.0.0',
        commands: [{ name: 'review', description: 'Run review command' }],
        agents: [{ name: 'reviewer', description: 'Review agent', tools: ['read', 'grep'] }],
      }),
      'utf-8',
    )

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
    })

    await app.start()

    expect(app.pluginCommandRegistry.get('review')).toEqual({
      pluginId: 'command-agent-plugin',
      command: { name: 'review', description: 'Run review command' },
    })
    expect(app.pluginAgentRegistry.get('reviewer')).toEqual({
      pluginId: 'command-agent-plugin',
      agent: { name: 'reviewer', description: 'Review agent', tools: ['read', 'grep'] },
    })
    expect(
      app.pluginManager
        ?.getDiagnostics()
        .results.find((result) => result.pluginId === 'command-agent-plugin')?.steps,
    ).toEqual([
      { type: 'command', name: 'review', status: 'loaded' },
      { type: 'agent', name: 'reviewer', status: 'loaded' },
    ])

    await app.stop()

    expect(app.pluginCommandRegistry.list()).toEqual([])
    expect(app.pluginAgentRegistry.list()).toEqual([])
  })

  it('#then wires plugin devtools contributions through XMarsApp when inspect is enabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-devtools-plugins-'))
    const pluginDir = join(root, 'devtools-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'devtools-plugin',
        name: 'Devtools Plugin',
        version: '1.0.0',
        devtools: {
          panels: [{ name: 'trace-panel', title: 'Trace Panel' }],
          providers: [{ name: 'trace-provider', kind: 'timeline' }],
          actions: [{ name: 'clear-trace', title: 'Clear Trace' }],
        },
      }),
      'utf-8',
    )

    const app = createXMars({
      port: 0,
      inspect: true,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
      trustedPluginIds: ['devtools-plugin'],
    })

    await app.start()

    expect(app.devtools?.listPluginContributions()).toEqual([
      {
        pluginId: 'devtools-plugin',
        contribution: {
          panels: [{ name: 'trace-panel', title: 'Trace Panel' }],
          providers: [{ name: 'trace-provider', kind: 'timeline' }],
          actions: [{ name: 'clear-trace', title: 'Clear Trace' }],
        },
      },
    ])

    await app.stop()

    expect(app.devtools?.listPluginContributions()).toEqual([])
  })

  it('#then wires plugin log contributions through XMarsApp with redacted sink entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-app-log-plugins-'))
    const pluginDir = join(root, 'log-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'log-plugin',
        name: 'Log Plugin',
        version: '1.0.0',
        logs: {
          sinks: [{ name: 'memory-sink', kind: 'memory' }],
          formatters: [{ name: 'json-lines' }],
          viewers: [{ name: 'log-viewer', title: 'Log Viewer' }],
        },
      }),
      'utf-8',
    )

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test-log-plugin',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir: root,
      pluginRoots: [root],
      trustedPluginIds: ['log-plugin'],
    })

    await app.start()

    expect(listPluginLogContributions()).toContainEqual({
      pluginId: 'log-plugin',
      contribution: {
        sinks: [{ name: 'memory-sink', kind: 'memory' }],
        formatters: [{ name: 'json-lines' }],
        viewers: [{ name: 'log-viewer', title: 'Log Viewer' }],
      },
    })

    app.logger.error({ token: 'secret-token', safe: 'visible' }, 'plugin log sink test')

    let entries = getPluginLogSinkEntries('log-plugin')
    for (let attempt = 0; attempt < 10; attempt++) {
      entries = getPluginLogSinkEntries('log-plugin')
      if (entries.length > 0) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(entries[0]!.event).toMatchObject({
      token: '[REDACTED]',
      safe: 'visible',
    })

    await app.stop()

    expect(listPluginLogContributions().some((item) => item.pluginId === 'log-plugin')).toBe(false)
  })
})
