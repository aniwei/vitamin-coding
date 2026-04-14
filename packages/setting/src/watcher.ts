import { TypedEventEmitter, createLogger } from '@vitamin/shared'
import { type FSWatcher, watch } from 'node:fs'
import type { Disposable, Events } from '@vitamin/shared'
import type { VitaminSetting } from './types'

const logger = createLogger('@vitamin/setting:watcher')

interface WatcherEvents extends Events {
  change: (config: Partial<VitaminSetting>, path: string) => void
  error: (error: Error) => void
}

export interface SettingWatcherOptions {
  paths: string[]
  reload: (path: string) => Promise<Partial<VitaminSetting>>
  debounceMs?: number
}

export function createSettingWatcher(options: SettingWatcherOptions): SettingWatcher {
  return new SettingWatcher(options)
}

export class SettingWatcher extends TypedEventEmitter<WatcherEvents> implements Disposable {
  private watchers: FSWatcher[] = []
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  private readonly debounceMs: number
  private readonly reload: (path: string) => Promise<Partial<VitaminSetting>>

  constructor(options: SettingWatcherOptions) {
    super()

    this.debounceMs = options.debounceMs ?? 300
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
    if (existing) {
      clearTimeout(existing)
    }

    this.debounceTimers.set(
      path,
      setTimeout(async () => {
        this.debounceTimers.delete(path)

        try {
          const config = await this.reload(path)
          this.emit('change', config, path)

          logger.info({ path }, 'Setting reloaded')
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          this.emit('error', err)

          logger.error({ path, err }, 'Failed to reload setting')
        }
      }, this.debounceMs),
    )
  };

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
