import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyPluginRuntimePlan,
  discoverPluginManifests,
  disablePluginRuntimePlan,
  getPluginLoadErrors,
  buildPluginRuntimePlan,
  summarizePluginManifest,
  validatePluginManifest,
} from '../src/plugin-manifest'
import { ToolRegistry } from '../src/tool-registry'

const manifest = {
  id: 'review-tools',
  name: 'Review Tools',
  version: '1.0.0',
  status: 'enabled',
  permissions: ['tools', 'filesystem'] as const,
  tools: [
    {
      name: 'review_patch',
      module: './tools/review-patch',
      preset: 'standard' as const,
      category: 'review',
      shouldDefer: true,
      permissions: ['filesystem'] as const,
    },
  ],
  skills: [
    { name: 'code-review', path: './skills/code-review/SKILL.md', trigger: 'manual' as const },
  ],
  mcpServers: [{ name: 'docs', command: 'mcp-docs', args: ['--stdio'] }],
  hooks: [
    {
      name: 'review-hook',
      timing: 'chat.message.before' as const,
      module: './hooks/review-hook.js',
    },
  ],
  commands: [
    {
      name: 'review',
      description: 'Run review command',
      prompt: 'Review $ARGUMENTS.',
      permissions: ['filesystem' as const],
      arguments: [
        {
          name: 'path',
          description: 'Target path',
          required: true,
          type: 'string',
          flag: 'path',
          alias: 'target',
          repeatable: true,
          choices: ['src/app.ts', 'src/index.ts'],
          default: 'src/app.ts',
        },
      ],
    },
  ],
  agents: [
    {
      name: 'reviewer',
      description: 'Review agent',
      prompt: 'Review the implementation.',
      tools: ['review_patch'],
    },
  ],
  devtools: {
    panels: [{ name: 'review-panel', title: 'Review Panel', path: './devtools/review.html' }],
    providers: [{ name: 'review-diagnostics', kind: 'diagnostics' as const }],
    actions: [{ name: 'rerun-review', title: 'Rerun Review' }],
  },
  logs: {
    sinks: [{ name: 'review-sink', kind: 'memory' as const }],
    formatters: [{ name: 'review-json', mediaType: 'application/json' }],
    viewers: [{ name: 'review-logs', title: 'Review Logs' }],
  },
}

describe('plugin manifest', () => {
  it('validates and summarizes a plugin manifest', () => {
    expect(validatePluginManifest(manifest)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    })

    expect(summarizePluginManifest(manifest)).toEqual({
      id: 'review-tools',
      name: 'Review Tools',
      version: '1.0.0',
      enabled: true,
      toolCount: 1,
      skillCount: 1,
      mcpServerCount: 1,
      hookCount: 1,
      commandCount: 1,
      agentCount: 1,
      devtoolsPanelCount: 1,
      devtoolsProviderCount: 1,
      devtoolsActionCount: 1,
      logSinkCount: 1,
      logFormatterCount: 1,
      logViewerCount: 1,
      permissions: ['tools', 'filesystem'],
      deferredTools: ['review_patch'],
    })
  })

  it('reports duplicate entries, invalid permissions and malformed status', () => {
    const result = validatePluginManifest({
      id: 'bad',
      name: 'Bad',
      version: '1.0.0',
      status: 'paused',
      permissions: ['root'],
      tools: [{ name: 'dup' }, { name: 'dup' }],
      skills: [{ name: 'skill', path: '', trigger: 'sometimes' }],
      mcpServers: [{ name: 'mcp' }, { name: 'mcp' }],
      commands: [
        {
          name: 'bad-command',
          permissions: ['root'],
          arguments: [
            {
              required: 'yes',
              type: 'object',
              flag: '--bad',
              alias: 'confirm-plugin',
              repeatable: 'yes',
              choices: [''],
              default: '',
            },
            { name: 'dupe', flag: 'same' },
            { name: 'dupe-2', alias: 'same' },
            { name: 'tail', repeatable: true },
            { name: 'after-tail' },
          ],
        },
      ],
      devtools: { providers: [{ name: 'bad-provider', kind: 'trace' }] },
      logs: { sinks: [{ name: 'bad-sink', kind: 'raw' }] },
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('status must be enabled or disabled')
    expect(result.errors).toContain('permissions contains invalid permission: root')
    expect(result.errors).toContain('tools.name contains duplicate value: dup')
    expect(result.errors).toContain('skills[0].path is required')
    expect(result.errors).toContain('skills[0].trigger must be manual or auto')
    expect(result.errors).toContain('mcpServers.name contains duplicate value: mcp')
    expect(result.errors).toContain('commands[0].permissions contains invalid permission: root')
    expect(result.errors).toContain('commands[0].arguments[0].name is required')
    expect(result.errors).toContain('commands[0].arguments[0].required must be a boolean')
    expect(result.errors).toContain(
      'commands[0].arguments[0].type must be string, number or boolean',
    )
    expect(result.errors).toContain('commands[0].arguments[0].repeatable must be a boolean')
    expect(result.errors).toContain(
      'commands[0].arguments[0].flag must be a command flag name without leading dashes',
    )
    expect(result.errors).toContain('commands[0].arguments[0].alias is reserved by the host')
    expect(result.errors).toContain('commands[0].arguments[2].alias must be unique')
    expect(result.errors).toContain(
      'commands[0].arguments[3].repeatable positional argument must be last',
    )
    expect(result.errors).toContain('commands[0].arguments[0].choices[0] is required')
    expect(result.errors).toContain('commands[0].arguments[0].default is required')
    expect(result.errors).toContain('devtools.providers[0].kind must be diagnostics or timeline')
    expect(result.errors).toContain('logs.sinks[0].kind must be memory, devtools or custom')
    expect(result.warnings).toContain(
      'tools[0].module is missing; loader must provide tool implementation',
    )
  })

  it('returns load errors for non-object manifests', () => {
    expect(getPluginLoadErrors(null)).toEqual(['manifest must be an object'])
  })

  it('builds runtime plan for tools, skills, mcp servers and permissions', () => {
    expect(buildPluginRuntimePlan(manifest)).toEqual({
      pluginId: 'review-tools',
      enabled: true,
      toolOptions: {
        review_patch: {
          pluginId: 'review-tools',
          preset: 'standard',
          category: 'review',
          shouldDefer: true,
        },
      },
      skills: [{ name: 'code-review', path: './skills/code-review/SKILL.md', trigger: 'manual' }],
      mcpServers: {
        docs: { command: 'mcp-docs', args: ['--stdio'] },
      },
      hooks: [
        {
          name: 'review-hook',
          timing: 'chat.message.before',
          module: './hooks/review-hook.js',
        },
      ],
      commands: [
        {
          name: 'review',
          description: 'Run review command',
          prompt: 'Review $ARGUMENTS.',
          permissions: ['filesystem'],
          arguments: [
            {
              name: 'path',
              description: 'Target path',
              required: true,
              type: 'string',
              flag: 'path',
              alias: 'target',
              repeatable: true,
              choices: ['src/app.ts', 'src/index.ts'],
              default: 'src/app.ts',
            },
          ],
        },
      ],
      agents: [
        {
          name: 'reviewer',
          description: 'Review agent',
          prompt: 'Review the implementation.',
          tools: ['review_patch'],
        },
      ],
      devtools: {
        panels: [{ name: 'review-panel', title: 'Review Panel', path: './devtools/review.html' }],
        providers: [{ name: 'review-diagnostics', kind: 'diagnostics' }],
        actions: [{ name: 'rerun-review', title: 'Rerun Review' }],
      },
      logs: {
        sinks: [{ name: 'review-sink', kind: 'memory' }],
        formatters: [{ name: 'review-json', mediaType: 'application/json' }],
        viewers: [{ name: 'review-logs', title: 'Review Logs' }],
      },
      permissions: ['tools', 'filesystem'],
      errors: [],
      warnings: [],
    })
  })

  it('applies runtime plan through host lifecycle adapters', async () => {
    const calls: string[] = []
    const plan = buildPluginRuntimePlan(manifest)

    const result = await applyPluginRuntimePlan(plan, {
      registerToolOptions: async (name, options) => {
        calls.push(`tool:${name}:${options.pluginId}`)
      },
      loadSkill: async (skill, pluginId) => {
        calls.push(`skill:${skill.name}:${pluginId}`)
      },
      connectMcpServer: async (name, config, pluginId) => {
        calls.push(`mcp:${name}:${pluginId}:${config.command}`)
      },
      registerDevtools: async (contribution, pluginId) => {
        calls.push(`devtools:${pluginId}:${contribution.panels?.[0]?.name}`)
      },
      registerLogs: async (contribution, pluginId) => {
        calls.push(`logs:${pluginId}:${contribution.sinks?.[0]?.name}`)
      },
    })

    expect(calls).toEqual([
      'tool:review_patch:review-tools',
      'skill:code-review:review-tools',
      'mcp:docs:review-tools:mcp-docs',
      'devtools:review-tools:review-panel',
      'logs:review-tools:review-sink',
    ])
    expect(result).toMatchObject({
      pluginId: 'review-tools',
      enabled: true,
      errors: [],
      steps: [
        { type: 'tool', name: 'review_patch', status: 'loaded' },
        { type: 'skill', name: 'code-review', status: 'loaded' },
        { type: 'mcp', name: 'docs', status: 'loaded' },
        { type: 'hook', name: 'review-hook', status: 'skipped' },
        { type: 'command', name: 'review', status: 'skipped' },
        { type: 'agent', name: 'reviewer', status: 'skipped' },
        { type: 'devtools', name: 'devtools', status: 'loaded' },
        { type: 'log', name: 'logs', status: 'loaded' },
      ],
    })
  })

  it('reports skipped lifecycle steps and adapter failures', async () => {
    const plan = buildPluginRuntimePlan(manifest)

    const result = await applyPluginRuntimePlan(plan, {
      registerToolOptions: async () => {
        throw new Error('registration failed')
      },
    })

    expect(result.steps).toEqual([
      { type: 'tool', name: 'review_patch', status: 'error', error: 'registration failed' },
      {
        type: 'skill',
        name: 'code-review',
        status: 'skipped',
        warning: 'skill loader adapter is not configured',
      },
      {
        type: 'mcp',
        name: 'docs',
        status: 'skipped',
        warning: 'mcp manager adapter is not configured',
      },
      {
        type: 'hook',
        name: 'review-hook',
        status: 'skipped',
        warning: 'hook adapter is not configured',
      },
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
      {
        type: 'devtools',
        name: 'devtools',
        status: 'skipped',
        warning: 'devtools adapter is not configured',
      },
      {
        type: 'log',
        name: 'logs',
        status: 'skipped',
        warning: 'log adapter is not configured',
      },
    ])
    expect(result.errors).toEqual(['tool "review_patch" failed: registration failed'])
    expect(result.warnings).toContain('skill "code-review": skill loader adapter is not configured')
    expect(result.warnings).toContain('mcp "docs": mcp manager adapter is not configured')
    expect(result.warnings).toContain('devtools "devtools": devtools adapter is not configured')
    expect(result.warnings).toContain('log "logs": log adapter is not configured')
  })

  it('disables runtime plan through host lifecycle adapters', async () => {
    const calls: string[] = []

    const result = await disablePluginRuntimePlan(buildPluginRuntimePlan(manifest), {
      unregisterTool: async (name, pluginId) => {
        calls.push(`tool:${name}:${pluginId}`)
      },
      unloadSkill: async (skill, pluginId) => {
        calls.push(`skill:${skill.name}:${pluginId}`)
      },
      disconnectMcpServer: async (name, pluginId) => {
        calls.push(`mcp:${name}:${pluginId}`)
      },
      unloadHook: async (hook, pluginId) => {
        calls.push(`hook:${hook.name}:${pluginId}`)
      },
      unregisterCommand: async (command, pluginId) => {
        calls.push(`command:${command.name}:${pluginId}`)
      },
      unregisterAgent: async (agent, pluginId) => {
        calls.push(`agent:${agent.name}:${pluginId}`)
      },
      unregisterDevtools: async (pluginId) => {
        calls.push(`devtools:${pluginId}`)
      },
      unregisterLogs: async (pluginId) => {
        calls.push(`logs:${pluginId}`)
      },
    })

    expect(calls).toEqual([
      'tool:review_patch:review-tools',
      'skill:code-review:review-tools',
      'mcp:docs:review-tools',
      'hook:review-hook:review-tools',
      'command:review:review-tools',
      'agent:reviewer:review-tools',
      'devtools:review-tools',
      'logs:review-tools',
    ])
    expect(result.enabled).toBe(false)
    expect(result.steps.map((step) => step.status)).toEqual([
      'disabled',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
    ])
  })

  it('stores plugin id in registered tool metadata', () => {
    const registry = new ToolRegistry()
    registry.register(
      {
        name: 'plugin_tool',
        description: 'Plugin tool',
        parameters: { safeParse: (input: unknown) => ({ success: true, data: input }) },
        execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      },
      { pluginId: 'review-tools', category: 'review' },
    )

    expect(registry.get('plugin_tool')?.metadata).toMatchObject({
      pluginId: 'review-tools',
      category: 'review',
    })
  })

  it('discovers plugin manifests from plugin roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-plugin-root-'))
    await mkdir(join(root, 'review-tools'), { recursive: true })
    await mkdir(join(root, 'bad-json'), { recursive: true })
    await writeFile(join(root, 'review-tools', 'plugin.json'), JSON.stringify(manifest), 'utf-8')
    await writeFile(join(root, 'bad-json', 'plugin.json'), '{bad json', 'utf-8')

    const result = await discoverPluginManifests([root, join(root, 'missing')])

    const validManifest = result.manifests.find((item) => item.manifest?.id === 'review-tools')
    const invalidManifest = result.manifests.find((item) => !item.validation.valid)

    expect(result.manifests).toHaveLength(2)
    expect(validManifest).toMatchObject({
      manifest: { id: 'review-tools' },
      runtimePlan: { pluginId: 'review-tools' },
      validation: { valid: true },
    })
    expect(invalidManifest?.validation.valid).toBe(false)
    expect(invalidManifest?.validation.errors[0]).toContain('Invalid JSON')
    expect(result.errors[0]).toContain('Cannot read plugin root')
  })

  it('discovers a plugin when the root itself is the plugin directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-plugin-dir-'))
    await writeFile(join(root, 'plugin.json'), JSON.stringify(manifest), 'utf-8')

    const result = await discoverPluginManifests([root])

    expect(result.errors).toEqual([])
    expect(result.manifests).toHaveLength(1)
    expect(result.manifests[0]).toMatchObject({
      manifest: { id: 'review-tools' },
      runtimePlan: { pluginId: 'review-tools' },
      validation: { valid: true },
    })
  })
})
