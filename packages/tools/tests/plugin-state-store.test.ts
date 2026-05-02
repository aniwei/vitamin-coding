import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createFilePluginStateStore, normalizePluginState } from '../src/plugin-state-store'

describe('PluginStateStore', () => {
  it('#then returns empty state when the state file does not exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-plugin-state-'))
    const store = createFilePluginStateStore({ workspaceDir: root })

    await expect(store.load()).resolves.toEqual({
      trustedPluginIds: [],
      disabledPluginIds: [],
    })
  })

  it('#then persists trusted and disabled plugin ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-plugin-state-'))
    const store = createFilePluginStateStore({ workspaceDir: root })

    await store.trust('review-plugin')
    await store.disable('review-plugin')
    await store.trust('review-plugin')

    expect(await store.load()).toEqual({
      trustedPluginIds: ['review-plugin'],
      disabledPluginIds: ['review-plugin'],
    })

    await store.enable('review-plugin')
    await store.untrust('review-plugin')

    expect(await store.load()).toEqual({
      trustedPluginIds: [],
      disabledPluginIds: [],
    })
    expect(JSON.parse(await readFile(store.path, 'utf-8'))).toEqual({
      trustedPluginIds: [],
      disabledPluginIds: [],
    })
  })

  it('#then normalizes malformed state values', () => {
    expect(
      normalizePluginState({
        trustedPluginIds: ['b', '', 'a', 'a', 1],
        disabledPluginIds: 'not-array',
      }),
    ).toEqual({
      trustedPluginIds: ['a', 'b'],
      disabledPluginIds: [],
    })
  })

  it('#then reports invalid json with the state file path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-plugin-state-'))
    const statePath = join(root, '.x-mars', 'plugins.json')
    const store = createFilePluginStateStore({ workspaceDir: root, path: statePath })
    await mkdir(join(root, '.x-mars'), { recursive: true })
    await writeFile(statePath, '{bad', 'utf-8')

    await expect(store.load()).rejects.toThrow(`Invalid plugin state file ${statePath}`)
  })
})
