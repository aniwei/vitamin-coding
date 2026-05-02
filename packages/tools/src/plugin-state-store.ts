import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export interface PluginState {
  trustedPluginIds: string[]
  disabledPluginIds: string[]
}

export interface PluginStateStore {
  readonly path: string
  load(): Promise<PluginState>
  save(state: PluginState): Promise<PluginState>
  trust(pluginId: string): Promise<PluginState>
  untrust(pluginId: string): Promise<PluginState>
  enable(pluginId: string): Promise<PluginState>
  disable(pluginId: string): Promise<PluginState>
}

export interface FilePluginStateStoreOptions {
  workspaceDir: string
  path?: string
}

const EMPTY_PLUGIN_STATE: PluginState = {
  trustedPluginIds: [],
  disabledPluginIds: [],
}

export function createFilePluginStateStore(options: FilePluginStateStoreOptions): PluginStateStore {
  const statePath = options.path ?? resolve(options.workspaceDir, '.x-mars', 'plugins.json')

  return {
    path: statePath,
    async load() {
      try {
        const content = await readFile(statePath, 'utf-8')
        return normalizePluginState(JSON.parse(content))
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return { ...EMPTY_PLUGIN_STATE }
        }
        if (error instanceof SyntaxError) {
          throw new Error(`Invalid plugin state file ${statePath}: ${error.message}`)
        }
        throw error
      }
    },
    async save(state) {
      const normalized = normalizePluginState(state)
      await mkdir(dirname(statePath), { recursive: true })
      await writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
      return normalized
    },
    async trust(pluginId) {
      const state = await this.load()
      return this.save(addPluginId(state, 'trustedPluginIds', pluginId))
    },
    async untrust(pluginId) {
      const state = await this.load()
      return this.save(removePluginId(state, 'trustedPluginIds', pluginId))
    },
    async enable(pluginId) {
      const state = await this.load()
      return this.save(removePluginId(state, 'disabledPluginIds', pluginId))
    },
    async disable(pluginId) {
      const state = await this.load()
      return this.save(addPluginId(state, 'disabledPluginIds', pluginId))
    },
  }
}

export function normalizePluginState(value: unknown): PluginState {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_PLUGIN_STATE }
  }

  const candidate = value as Partial<Record<keyof PluginState, unknown>>
  return {
    trustedPluginIds: normalizeIdList(candidate.trustedPluginIds),
    disabledPluginIds: normalizeIdList(candidate.disabledPluginIds),
  }
}

function addPluginId(state: PluginState, key: keyof PluginState, pluginId: string): PluginState {
  return normalizePluginState({
    ...state,
    [key]: [...state[key], pluginId],
  })
}

function removePluginId(state: PluginState, key: keyof PluginState, pluginId: string): PluginState {
  return normalizePluginState({
    ...state,
    [key]: state[key].filter((id) => id !== pluginId),
  })
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [
    ...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0)),
  ].sort()
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
