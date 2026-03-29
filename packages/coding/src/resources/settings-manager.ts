import { loadConfig, createConfigWatcher } from '@vitamin/config'
import type {
  VitaminConfig,
  ConfigStore,
} from '@vitamin/config'
import type { ConfigWatcher } from '@vitamin/config'
import { TypedEventEmitter, type Events } from '@vitamin/shared'

export interface SettingsOptions {
  workspaceDir?: string
  globalConfigPath?: string
  projectConfigPath?: string
  overrides?: Partial<VitaminConfig>
  store?: ConfigStore
  watch?: boolean
}

interface SettingsEvents extends Events {
  change: (config: VitaminConfig) => void
}

export type SettingsManagerOptions = SettingsOptions

export class SettingsManager extends TypedEventEmitter<SettingsEvents> {
  private watcher: ConfigWatcher | null = null

  private readonly options: SettingsOptions
  private readonly paths: string[]
  private readonly watch: boolean

  private store: ConfigStore | undefined
  private currentConfig: VitaminConfig = {} as VitaminConfig

  constructor(options: SettingsOptions = {}) {
    super()
    this.options = options
    this.store = options.store
    this.watch = options.watch ?? false
    this.paths = buildConfigPaths(options)
  }

  get<K extends keyof VitaminConfig>(key: K): VitaminConfig[K] {
    return this.currentConfig[key]
  }

  get config(): Readonly<VitaminConfig> {
    return this.snapshot
  }

  get model(): VitaminConfig['model'] {
    return this.currentConfig.model
  }

  get compaction(): VitaminConfig['compaction'] {
    return this.currentConfig.compaction
  }

  get session(): VitaminConfig['session'] {
    return this.currentConfig.session
  }

  get snapshot(): Readonly<VitaminConfig> {
    return this.currentConfig
  }

  async load(): Promise<VitaminConfig> {
    const config = await this.reload()

    if (this.watch && this.paths.length > 0 && !this.watcher) {
      this.watching()
    }

    return config
  }

  async reload(): Promise<VitaminConfig> {
    const config = await loadConfig({
      overrides: this.options.overrides,
      store: this.store,
      configPaths: this.paths,
    })

    this.currentConfig = config
    this.emit('change', config)

    return config
  }

  // 应用运行时覆盖并重新加载 
  async update(overrides: Partial<VitaminConfig>): Promise<VitaminConfig> {
    this.options.overrides = {
      ...this.options.overrides,
      ...overrides,
    }

    return this.reload()
  }

  private watching(): void {
    this.watcher = createConfigWatcher({
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

export const Settings = SettingsManager

function buildConfigPaths(options: SettingsOptions): string[] {
  const paths: string[] = []

  // 全局配置（低优先级）
  if (options.globalConfigPath) {
    paths.push(options.globalConfigPath)
  }

  // 项目级配置（高优先级）
  if (options.projectConfigPath) {
    paths.push(options.projectConfigPath)
  } else if (options.workspaceDir) {
    paths.push(`${options.workspaceDir}/.vitamin/config.jsonc`)
  }

  return paths
}

export function createSettingsManager(
  options?: SettingsManagerOptions,
): Promise<SettingsManager> {
  const settings = new SettingsManager(options)
  return settings.load().then(() => settings)
}

export const createSettings = createSettingsManager
