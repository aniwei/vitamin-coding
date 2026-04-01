import { 
  loadSetting,
  createSettingWatcher,
} from '@vitamin/setting'
import type {
  VitaminSetting,
  SettingStore,
} from '@vitamin/setting'
import { 
  TypedEventEmitter, 
  type Events 
} from '@vitamin/shared'
import type { SettingWatcher } from '@vitamin/setting'

export interface SettingsOptions {
  workspaceDir?: string
}

interface SettingsEvents extends Events {
  change: (config: VitaminSetting) => void
}

export type SettingsManagerOptions = SettingsOptions

export class SettingsManager extends TypedEventEmitter<SettingsEvents> {
  private watcher: SettingWatcher | null = null

  private readonly paths: string[]
  private readonly watch: boolean

  private store: SettingStore | undefined
  private setting: VitaminSetting = {} as VitaminSetting

  constructor(options: SettingsOptions = {}) {
    super()
    this.watch = false
    this.paths = buildSettingPaths(options)
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
    const setting = await this.reload()

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

    this.setting = setting
    this.emit('change', setting)

    return setting
  }

  async update(overrides: Partial<VitaminSetting>): Promise<VitaminSetting> {
    return this.reload(overrides)
  }

  private watching(): void {
    this.watcher = createSettingWatcher({
      paths: this.paths,
      reload: async () => this.reload(),
    })

    this.watcher.on('error', () => {
      // Errors are surfaced through the watcher; SettingsManager keeps last good snapshot.
    })
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher[Symbol.dispose]()
      this.watcher = null
    }
  }
}

export const createSettings = createSettingsManager

function buildSettingPaths(options: SettingsOptions): string[] {
  const paths: string[] = []

  // 全局配置（低优先级）
  // if (options.globalSettingPath) {
  //   paths.push(options.globalSettingPath)
  // }

  // // 项目级配置（高优先级）
  // if (options.projectSettingPath) {
  //   paths.push(options.projectSettingPath)
  // } else if (options.workspaceDir) {
  //   paths.push(`${options.workspaceDir}/.vitamin/config.jsonc`)
  // }

  return paths
}

export function createSettingsManager(
  options?: SettingsManagerOptions,
): Promise<SettingsManager> {
  const settings = new SettingsManager(options)
  return settings.load().then(() => settings)
}
