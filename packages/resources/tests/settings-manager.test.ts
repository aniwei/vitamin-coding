import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SettingsManager, createSettingsManager } from '../src/settings-manager'
import { createSettingStore } from '@x-mars/setting'

// ═══ SettingsManager ═══

describe('SettingsManager', () => {
  it('creates with default config when no files provided', async () => {
    const mgr = new SettingsManager()
    await mgr.load()

    expect(mgr.config).toBeDefined()
    expect(mgr.config.log_level).toBe('info')
    expect(mgr.config.tool_preset).toBe('full')
  })

  it('creates via factory function', async () => {
    const mgr = await createSettingsManager()

    expect(mgr.config).toBeDefined()
    expect(mgr.config.log_level).toBe('info')
  })

  it('applies overrides to config', async () => {
    const mgr = await createSettingsManager({
      overrides: { log_level: 'debug', model: 'test-model' },
    })

    expect(mgr.config.log_level).toBe('debug')
    expect(mgr.config.model).toBe('test-model')
  })

  it('provides typed access via get()', async () => {
    const mgr = await createSettingsManager({
      overrides: { model: 'claude-3' },
    })

    expect(mgr.get('model')).toBe('claude-3')
    expect(mgr.get('log_level')).toBe('info')
  })

  it('provides convenience getters', async () => {
    const mgr = await createSettingsManager({
      overrides: { model: 'gpt-4' },
    })

    expect(mgr.model).toBe('gpt-4')
    expect(mgr.compaction).toBeDefined()
    expect(mgr.session).toBeDefined()
  })

  it('applies runtime overrides via update()', async () => {
    const mgr = await createSettingsManager({
      overrides: { model: 'original' },
    })

    expect(mgr.model).toBe('original')

    await mgr.update({ model: 'updated' })

    expect(mgr.model).toBe('updated')
  })

  it('notifies onChange listeners on update', async () => {
    const mgr = await createSettingsManager()

    const changes: unknown[] = []
    mgr.on('change', (config) => changes.push(config.model))

    await mgr.update({ model: 'new-model' })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBe('new-model')
  })

  it('unsubscribes from onChange', async () => {
    const mgr = await createSettingsManager()

    const changes: string[] = []
    const unsub = mgr.on('change', (config) => changes.push(config.model ?? ''))

    await mgr.update({ model: 'first' })
    unsub()
    await mgr.update({ model: 'second' })

    expect(changes).toHaveLength(1)
  })

  it('merges overrides cumulatively', async () => {
    const mgr = await createSettingsManager({
      overrides: { model: 'base', log_level: 'warn' },
    })

    await mgr.update({ model: 'updated' })

    // model is updated, log_level retained from original overrides
    expect(mgr.model).toBe('updated')
    expect(mgr.get('log_level')).toBe('warn')
  })

  it('builds correct config paths from workspaceDir', async () => {
    // When workspaceDir is provided but no explicit projectConfigPath,
    // it falls back to ${workspaceDir}/.x-mars/config.jsonc which won't exist
    // but loadSetting should still return defaults
    const mgr = await createSettingsManager({
      workspaceDir: '/tmp/test-project',
    })

    expect(mgr.config).toBeDefined()
    expect(mgr.config.log_level).toBe('info')
  })

  it('loads user, project, project-local, managed, and runtime layers in order', async () => {
    const store = createSettingStore({
      type: 'memory',
      initial: {
        '/user/config.jsonc': JSON.stringify({
          model: 'user-model',
          disabled_tools: ['user-tool'],
        }),
        '/workspace/.x-mars/config.jsonc': JSON.stringify({
          model: 'project-model',
          disabled_tools: ['project-tool'],
        }),
        '/workspace/.x-mars/config.local.jsonc': JSON.stringify({
          theme: 'dark',
          disabled_tools: ['local-tool'],
        }),
        '/managed/config.jsonc': JSON.stringify({
          model: 'managed-model',
          disabled_tools: ['managed-tool'],
        }),
      },
    })

    const mgr = await createSettingsManager({
      workspaceDir: '/workspace',
      userConfigPath: '/user/config.jsonc',
      managedConfigPath: '/managed/config.jsonc',
      overrides: { model: 'runtime-model' },
      store,
    })

    expect(mgr.config.model).toBe('runtime-model')
    expect(mgr.config.theme).toBe('dark')
    expect(mgr.config.disabled_tools).toEqual([
      'user-tool',
      'project-tool',
      'local-tool',
      'managed-tool',
    ])
  })

  it('merges workspace file agents with settings agents and runtime overrides', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'x-mars-settings-agents-'))
    await mkdir(join(workspaceDir, '.x-mars', 'agents'), { recursive: true })
    await writeFile(
      join(workspaceDir, '.x-mars', 'agents', 'reviewer.md'),
      ['---', 'tools: [read, grep]', '---', 'Review from file.'].join('\n'),
      'utf-8',
    )

    const mgr = await createSettingsManager({
      workspaceDir,
      overrides: {
        agents: {
          reviewer: {
            tools: ['read'],
            system_prompt: 'Review from override.',
          },
        },
      },
    })

    expect(mgr.config.agents?.reviewer).toMatchObject({
      tools: ['read'],
      system_prompt: 'Review from override.',
    })
  })

  it('dispose cleans up resources', async () => {
    const mgr = await createSettingsManager()

    mgr.dispose()

    expect(() => mgr.dispose()).not.toThrow()
  })
})
