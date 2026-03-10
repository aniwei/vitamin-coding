// 配置文件监视器，支持变更事件发射
import { TypedEventEmitter, createLogger } from '@vitamin/shared'
import { type FSWatcher, watch as watch } from 'node:fs'
import type { Disposable, Events } from '@vitamin/shared'
import type { VitaminConfig } from './types'

const logger = createLogger('@vitamin/config:watcher')

interface WatcherEvents extends Events {
  change: (config: Partial<VitaminConfig>, path: string) => void
  error: (error: Error) => void
}

export interface ConfigWatcherOptions {
  paths: string[]
  reload: (path: string) => Promise<Partial<VitaminConfig>>
  debounceMs?: number // 防抖间隔（毫秒，默认 300）
}

// 监视配置文件变更并发射事件
export function createConfigWatcher(options: ConfigWatcherOptions): ConfigWatcher {
  return new ConfigWatcher(options)
}

export class ConfigWatcher extends TypedEventEmitter<WatcherEvents> implements Disposable {
  private watchers: FSWatcher[] = []
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly debounceMs: number
  private readonly reload: (path: string) => Promise<Partial<VitaminConfig>>

  constructor(options: ConfigWatcherOptions) {
    super()
    this.debounceMs = options.debounceMs ?? 300 // 防抖间隔（毫秒，默认 300）
    this.reload = options.reload
    this.start(options.paths)
  }

  private start(paths: string[]): void {
    for (const path of paths) {
      try {
        const watcher = watch(path, () => this.onChange(path))

        watcher.on('error', this.onError)

        this.watchers.push(watcher)
        logger.debug({ path }, 'Watching config file')
      } catch (error) {
        logger.debug({ path, err: error }, 'Cannot watch path (may not exist yet)')
      }
    }
  }

  private onError = (error: Error): void => {
    logger.error({ err: error }, 'Watcher error')
    this.emit('error', error)
  }

  private onChange = (path: string): void => {
    const existing = this.debounceTimers.get(path)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(path, setTimeout(async () => {
      this.debounceTimers.delete(path)

      try {
        const config = await this.reload(path)
        this.emit('change', config, path)
        
        logger.info({ path }, 'Config reloaded')
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.emit('error', err)
        
        logger.error({ path, err }, 'Failed to reload config')
      }
    }, this.debounceMs))
  }

  [Symbol.dispose](): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }

    this.watchers = []

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }

    this.debounceTimers.clear()
    this.removeAllListeners()
  }
}
