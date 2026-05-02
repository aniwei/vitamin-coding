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
  skills: [{ name: 'code-review', path: './skills/code-review/SKILL.md', trigger: 'manual' as const }],
  mcpServers: [{ name: 'docs', command: 'mcp-docs', args: ['--stdio'] }],
  hooks: [
    {
      name: 'review-hook',
      timing: 'chat.message.before' as const,
      module: './hooks/review-hook.js',
    },
  ],
  commands: [{ name: 'review', description: 'Run review command' }],
  agents: [{ name: 'reviewer', description: 'Review agent', tools: ['review_patch'] }],
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
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('status must be enabled or disabled')
    expect(result.errors).toContain('permissions contains invalid permission: root')
    expect(result.errors).toContain('tools.name contains duplicate value: dup')
    expect(result.errors).toContain('skills[0].path is required')
    expect(result.errors).toContain('skills[0].trigger must be manual or auto')
    expect(result.errors).toContain('mcpServers.name contains duplicate value: mcp')
    expect(result.warnings).toContain('tools[0].module is missing; loader must provide tool implementation')
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
      commands: [{ name: 'review', description: 'Run review command' }],
      agents: [{ name: 'reviewer', description: 'Review agent', tools: ['review_patch'] }],
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
    })

    expect(calls).toEqual([
      'tool:review_patch:review-tools',
      'skill:code-review:review-tools',
      'mcp:docs:review-tools:mcp-docs',
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
    ])
    expect(result.errors).toEqual(['tool "review_patch" failed: registration failed'])
    expect(result.warnings).toContain('skill "code-review": skill loader adapter is not configured')
    expect(result.warnings).toContain('mcp "docs": mcp manager adapter is not configured')
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
    })

    expect(calls).toEqual([
      'tool:review_patch:review-tools',
      'skill:code-review:review-tools',
      'mcp:docs:review-tools',
    ])
    expect(result.enabled).toBe(false)
    expect(result.steps.map((step) => step.status)).toEqual([
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
    const root = await mkdtemp(join(tmpdir(), 'vitamin-plugin-root-'))
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
})
