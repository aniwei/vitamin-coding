import { describe, expect, it } from 'vitest'
import {
  BUILTIN_REVIEWER_AGENTS,
  COMPACTION_STRATEGIES,
  LOG_LEVELS,
  TOOL_PRESETS,
  X_MARS_SETTING_KEYS,
  WORKFLOW_SLOTS,
} from '../src/types'
import { loadSetting } from '../src/setting'
import { createSettingStore } from '../src/store'

describe('setting schema literals', () => {
  it('exposes expected log levels and tool presets', () => {
    expect(LOG_LEVELS).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    expect(TOOL_PRESETS).toEqual(['minimal', 'standard', 'full'])
  })

  it('exposes known workflow and compaction option sets', () => {
    expect(WORKFLOW_SLOTS).toEqual(['normal', 'thinking', 'compact', 'critique', 'vision'])
    expect(COMPACTION_STRATEGIES).toEqual(['summary', 'sliding-window', 'incremental'])
  })

  it('keeps builtin reviewer agent presets', () => {
    expect(BUILTIN_REVIEWER_AGENTS['spec-reviewer']).toMatchObject({
      categories: ['review'],
      default_workflow_slot: 'critique',
    })
    expect(BUILTIN_REVIEWER_AGENTS['quality-reviewer']).toMatchObject({
      categories: ['review'],
      default_workflow_slot: 'critique',
    })
  })

  it('lists stable top-level setting keys used by runtime validation', () => {
    expect(X_MARS_SETTING_KEYS).toContain('log_level')
    expect(X_MARS_SETTING_KEYS).toContain('tool_preset')
    expect(X_MARS_SETTING_KEYS).toContain('experimental')
    expect(X_MARS_SETTING_KEYS).not.toContain('mcp')
    expect(X_MARS_SETTING_KEYS).not.toContain('skills')
    expect(X_MARS_SETTING_KEYS).not.toContain('disabled_mcps')
    expect(X_MARS_SETTING_KEYS).not.toContain('disabled_skills')
  })
})

describe('setting validation without zod', () => {
  it('drops invalid known fields and keeps defaults', async () => {
    const store = createSettingStore({
      type: 'memory',
      initial: {
        main: JSON.stringify({
          log_level: 'verbose',
          tool_preset: 'super',
          disabled_tools: ['ok', 1],
        }),
      },
    })

    const setting = await loadSetting({
      store,
      paths: ['main'],
    })

    expect(setting.log_level).toBe('info')
    expect(setting.tool_preset).toBe('full')
    expect(setting.disabled_tools).toEqual([])
  })

  it('keeps unknown fields as passthrough values', async () => {
    const store = createSettingStore({
      type: 'memory',
      initial: {
        main: JSON.stringify({
          custom_plugin_field: 'hello',
        }),
      },
    })

    const setting = await loadSetting({
      store,
      paths: ['main'],
    })

    expect((setting as Record<string, unknown>).custom_plugin_field).toBe('hello')
  })

  it('drops removed legacy mcp and skill fields', async () => {
    const store = createSettingStore({
      type: 'memory',
      initial: {
        main: JSON.stringify({
          mcp: { servers: { local: { command: 'node' } } },
          skills: { enabled: ['research'] },
          disabled_mcps: ['legacy'],
          disabled_skills: ['legacy-skill'],
        }),
      },
    })

    const setting = await loadSetting({
      store,
      paths: ['main'],
    })

    const runtime = setting as Record<string, unknown>
    expect(runtime).not.toHaveProperty('mcp')
    expect(runtime).not.toHaveProperty('skills')
    expect(runtime).not.toHaveProperty('disabled_mcps')
    expect(runtime).not.toHaveProperty('disabled_skills')
  })
})
