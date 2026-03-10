import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createConfigWatcher } from '../src/watcher'

describe('ConfigWatcher', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  describe('#given a watched file', () => {
    it('#then emits change event on file modification', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'vitamin-watch-'))
      const configPath = join(tempDir, 'config.jsonc')
      await writeFile(configPath, '{ "log_level": "info" }')

      // 手写调用记录器，替代 vi.fn()
      const reloadCalls: string[] = []
      const onReload = async (path: string) => {
        reloadCalls.push(path)
        return { log_level: 'debug' as const }
      }

      const watcher = createConfigWatcher({
        paths: [configPath],
        reload: onReload,
        debounceMs: 50,
      })

      const changePromise = new Promise<void>((resolve) => {
        watcher.on('change', () => {
          resolve()
        })
      })

      // 触发文件变更
      await writeFile(configPath, '{ "log_level": "debug" }')

      await changePromise
      expect(reloadCalls).toContain(configPath)

      watcher[Symbol.dispose]()
    })
  })

  describe('#given dispose is called', () => {
    it('#then cleans up watchers', async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'vitamin-watch-'))
      const configPath = join(tempDir, 'config.jsonc')
      await writeFile(configPath, '{ "log_level": "info" }')

      const watcher = createConfigWatcher({
        paths: [configPath],
        reload: async () => ({}),
        debounceMs: 50,
      })

      watcher[Symbol.dispose]()

      // dispose 后监听器应被移除
      expect(watcher.listenerCount('change')).toBe(0)
      expect(watcher.listenerCount('error')).toBe(0)
    })
  })

  describe('#given a non-existent path', () => {
    it('#then does not throw during construction', () => {
      expect(() =>
        createConfigWatcher({
          paths: [`/tmp/does-not-exist-vitamin-test-${Date.now()}`],
          reload: async () => ({}),
        }),
      ).not.toThrow()
    })
  })
})
