import { loadSetting, createSettingWatcher } from '@vitamin/setting'
import type { VitaminSetting, SettingStore } from '@vitamin/setting'
import { createLogger, TypedEventEmitter, type Events } from '@vitamin/shared'
import type { SettingWatcher } from '@vitamin/setting'
import { resolve } from 'node:path'

const logger = createLogger('@vitamin/resource:settings-manager')

export interface SettingsOptions {
  workspaceDir?: string
  projectConfigPath?: string
  overrides?: Partial<VitaminSetting>
}

interface SettingsEvents extends Events {
  change: (config: VitaminSetting) => void
}

export type SettingsManagerOptions = SettingsOptions

export class SettingsManager extends TypedEventEmitter<SettingsEvents> {
  private watcher: SettingWatcher | null = null

  private readonly paths: string[]
  private readonly watch: boolean
  private overrides: Partial<VitaminSetting>

  private store: SettingStore | undefined
  private setting: VitaminSetting = {} as VitaminSetting

  constructor(options: SettingsOptions = {}) {
    super()
    this.watch = false
    this.paths = buildSettingPaths(options)
    this.overrides = { ...options.overrides }
  }

  get<K extends keyof VitaminSetting>(key: K): VitaminSetting[K] {
    return this.setting[key]
  }

  get config(): Readonly<VitaminSetting> {
    return this.snapshot
  }

  get model(): VitaminSetting['model'] {
    return this.setting.model
  }

  get compaction(): VitaminSetting['compaction'] {
    return this.setting.compaction
  }

  get session(): VitaminSetting['session'] {
    return this.setting.session
  }

  get snapshot(): Readonly<VitaminSetting> {
    return this.setting
  }

  async load(): Promise<VitaminSetting> {
    const setting = await this.reload(this.overrides)

    if (this.watch && this.paths.length > 0 && !this.watcher) {
      this.watching()
    }

    return setting
  }

  async reload(overrides?: Partial<VitaminSetting>): Promise<VitaminSetting> {
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

  async update(overrides: Partial<VitaminSetting>): Promise<VitaminSetting> {
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
    return [resolve(options.workspaceDir, '.vitamin/config.jsonc')]
  }

  return []
}
