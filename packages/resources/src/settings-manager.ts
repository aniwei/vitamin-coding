import {
  loadSetting,
  createSettingWatcher,
  discoverFileAgents,
  FileSettingStore,
} from '@x-mars/setting'
import type { XMarsSetting, SettingStore } from '@x-mars/setting'
import { createLogger, TypedEventEmitter, type Events } from '@x-mars/shared'
import type { SettingWatcher } from '@x-mars/setting'
import { resolve } from 'node:path'

const logger = createLogger('@x-mars/resource:settings-manager')

export interface SettingsOptions {
  workspaceDir?: string
  userConfigPath?: string
  projectConfigPath?: string
  projectLocalConfigPath?: string
  managedConfigPath?: string
  overrides?: Partial<XMarsSetting>
  store?: SettingStore
}

interface SettingsEvents extends Events {
  change: (config: XMarsSetting) => void
}

export type SettingsManagerOptions = SettingsOptions

export class SettingsManager extends TypedEventEmitter<SettingsEvents> {
  private watcher: SettingWatcher | null = null

  private readonly paths: string[]
  private readonly watch: boolean
  private readonly workspaceDir?: string
  private overrides: Partial<XMarsSetting>

  private store: SettingStore | undefined
  private setting: XMarsSetting = {} as XMarsSetting

  constructor(options: SettingsOptions = {}) {
    super()
    this.watch = false
    this.workspaceDir = options.workspaceDir
    this.paths = buildSettingPaths(options)
    this.overrides = { ...options.overrides }
    this.store = options.store ?? new FileSettingStore()
  }

  get<K extends keyof XMarsSetting>(key: K): XMarsSetting[K] {
    return this.setting[key]
  }

  get config(): Readonly<XMarsSetting> {
    return this.snapshot
  }

  get model(): XMarsSetting['model'] {
    return this.setting.model
  }

  get compaction(): XMarsSetting['compaction'] {
    return this.setting.compaction
  }

  get session(): XMarsSetting['session'] {
    return this.setting.session
  }

  get snapshot(): Readonly<XMarsSetting> {
    return this.setting
  }

  async load(): Promise<XMarsSetting> {
    const setting = await this.reload(this.overrides)

    if (this.watch && this.paths.length > 0 && !this.watcher) {
      this.watching()
    }

    return setting
  }

  async reload(overrides?: Partial<XMarsSetting>): Promise<XMarsSetting> {
    const setting = await loadSetting({
      store: this.store,
      paths: this.paths,
    })
    const fileAgents = this.workspaceDir
      ? await discoverFileAgents({ workspaceDir: this.workspaceDir })
      : {}

    const { agents: overrideAgents, ...otherOverrides } = overrides ?? {}
    this.setting = {
      ...setting,
      agents: {
        ...setting.agents,
        ...fileAgents,
        ...overrideAgents,
      },
      ...otherOverrides,
    }

    this.emit('change', this.setting)

    return this.setting
  }

  async update(overrides: Partial<XMarsSetting>): Promise<XMarsSetting> {
    this.overrides = {
      ...this.overrides,
      ...overrides,
    }

    return this.reload(this.overrides)
  }

  private watching(): void {
    this.watcher = createSettingWatcher({
      paths: this.paths,
      reload: async () => this.reload(),
    })

    this.watcher.on('error', () => {
      logger.error('Settings watcher error, stopping watcher')
    })
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher[Symbol.dispose]()
      this.watcher = null
    }
  }
}

export function createSettingsManager(
  options: SettingsManagerOptions = {},
): Promise<SettingsManager> {
  const settings = new SettingsManager(options)
  return settings.load().then(() => settings)
}

function buildSettingPaths(options: SettingsOptions): string[] {
  const paths: string[] = []

  if (options.userConfigPath) {
    paths.push(resolve(options.userConfigPath))
  }

  if (options.workspaceDir) {
    paths.push(
      resolve(options.projectConfigPath ?? resolve(options.workspaceDir, '.x-mars/config.jsonc')),
    )
    paths.push(
      resolve(
        options.projectLocalConfigPath ??
          resolve(options.workspaceDir, '.x-mars/config.local.jsonc'),
      ),
    )
  } else if (options.projectConfigPath) {
    paths.push(resolve(options.projectConfigPath))
  }

  if (options.managedConfigPath) {
    paths.push(resolve(options.managedConfigPath))
  }

  return [...new Set(paths)]
}
