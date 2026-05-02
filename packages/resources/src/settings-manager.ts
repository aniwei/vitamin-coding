import { loadSetting, createSettingWatcher } from '@x-mars/setting'
import type { XMarsSetting, SettingStore } from '@x-mars/setting'
import { createLogger, TypedEventEmitter, type Events } from '@x-mars/shared'
import type { SettingWatcher } from '@x-mars/setting'
import { resolve } from 'node:path'

const logger = createLogger('@x-mars/resource:settings-manager')

export interface SettingsOptions {
  workspaceDir?: string
  projectConfigPath?: string
  overrides?: Partial<XMarsSetting>
}

interface SettingsEvents extends Events {
  change: (config: XMarsSetting) => void
}

export type SettingsManagerOptions = SettingsOptions

export class SettingsManager extends TypedEventEmitter<SettingsEvents> {
  private watcher: SettingWatcher | null = null

  private readonly paths: string[]
  private readonly watch: boolean
  private overrides: Partial<XMarsSetting>

  private store: SettingStore | undefined
  private setting: XMarsSetting = {} as XMarsSetting

  constructor(options: SettingsOptions = {}) {
    super()
    this.watch = false
    this.paths = buildSettingPaths(options)
    this.overrides = { ...options.overrides }
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

    this.setting = {
      ...setting,
      ...overrides,
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
  if (options.projectConfigPath) {
    return [options.projectConfigPath]
  }

  if (options.workspaceDir) {
    return [resolve(options.workspaceDir, '.x-mars/config.jsonc')]
  }

  return []
}
