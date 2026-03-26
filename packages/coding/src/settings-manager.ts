import { loadConfig, createConfigWatcher } from '@vitamin/config'
import type {
  VitaminConfig,
  LoadConfigOptions,
  ConfigStore,
} from '@vitamin/config'
import type { ConfigWatcher } from '@vitamin/config'

export interface SettingsManagerOptions {
  // 项目工作目录（用于发现项目级配置文件） 
  workspaceDir?: string
  // 全局配置文件路径（如 ~/.config/vitamin/config.jsonc） 
  globalConfigPath?: string
  // 项目级配置文件路径（相对于 workspaceDir 或绝对路径）。未指定时默认 `${workspaceDir}/.vitamin/config.jsonc`
  projectConfigPath?: string
  // CLI / API 层的自选覆盖（最高优先级） 
  overrides?: Partial<VitaminConfig>
  // 扩展提供的默认值 
  extensionDefaults?: Partial<VitaminConfig>
  // 配置持久化后端 
  store?: ConfigStore
  // 是否监听配置文件变更（默认 false） 
  watch?: boolean
}

type SettingsChangeCallback = (config: VitaminConfig) => void

export class SettingsManager {
  #config: VitaminConfig
  private watcher: ConfigWatcher | null = null
  private changeCallbacks = new Set<SettingsChangeCallback>()
  private options: SettingsManagerOptions
  private configPaths: string[]

  private constructor(
    config: VitaminConfig,
    options: SettingsManagerOptions,
    configPaths: string[],
  ) {
    this.#config = config
    this.options = options
    this.configPaths = configPaths
  }

  /** 创建 SettingsManager 并加载初始配置 */
  static async create(options: SettingsManagerOptions = {}): Promise<SettingsManager> {
    const configPaths = buildConfigPaths(options)

    const loadOptions: LoadConfigOptions = {
      overrides: options.overrides,
      extensionDefaults: options.extensionDefaults,
      store: options.store,
      configPaths,
    }

    const config = await loadConfig(loadOptions)
    const manager = new SettingsManager(config, options, configPaths)

    if (options.watch && configPaths.length > 0) {
      manager.startWatching()
    }

    return manager
  }

  // 当前配置快照 
  get config(): Readonly<VitaminConfig> {
    return this.#config
  }

  /** 获取配置项 */
  get<K extends keyof VitaminConfig>(key: K): VitaminConfig[K] {
    return this.#config[key]
  }

  /** 获取默认模型 ID */
  get model(): string | undefined {
    return this.#config.model
  }

  /** 获取 compaction 配置 */
  get compaction() {
    return this.#config.compaction
  }

  /** 获取 session 配置 */
  get session() {
    return this.#config.session
  }

  /** 应用运行时覆盖并重新加载 */
  async update(overrides: Partial<VitaminConfig>): Promise<VitaminConfig> {
    this.options.overrides = {
      ...this.options.overrides,
      ...overrides,
    }

    const config = await loadConfig({
      overrides: this.options.overrides,
      extensionDefaults: this.options.extensionDefaults,
      store: this.options.store,
      configPaths: this.configPaths,
    })

    this.#config = config
    this.notifyChange()
    return config
  }

  /** 注册配置变更回调，返回取消函数 */
  onChange(callback: SettingsChangeCallback): () => void {
    this.changeCallbacks.add(callback)
    return () => { this.changeCallbacks.delete(callback) }
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher[Symbol.dispose]()
      this.watcher = null
    }
    this.changeCallbacks.clear()
  }

  private startWatching(): void {
    this.watcher = createConfigWatcher({
      paths: this.configPaths,
      reload: async () => {
        const config = await loadConfig({
          overrides: this.options.overrides,
          extensionDefaults: this.options.extensionDefaults,
          store: this.options.store,
          configPaths: this.configPaths,
        })
        this.#config = config
        this.notifyChange()
        return config
      },
    })
  }

  private notifyChange(): void {
    for (const cb of this.changeCallbacks) {
      cb(this.#config)
    }
  }
}

function buildConfigPaths(options: SettingsManagerOptions): string[] {
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
  return SettingsManager.create(options)
}
