// 本地文件系统 ConfigStore 实现
// 支持读取 JSONC 配置文件和写回 JSON

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { safeStringify } from '@vitamin/shared'
import { createLogger } from '@vitamin/shared'
import type { ConfigStore } from './store'
import type { VitaminConfig } from './types'

const logger = createLogger('@vitamin/config:local-store')

export class LocalConfigStore implements ConfigStore {
  readonly type = 'local' as const

  async read(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined
      }
      logger.warn({ path, err: error }, 'Failed to read config file')
      return undefined
    }
  }

  async write(path: string, config: Partial<VitaminConfig>): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const content = safeStringify(config, 2)
    await writeFile(path, content, 'utf-8')
    logger.debug({ path }, 'Config written')
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }
}
