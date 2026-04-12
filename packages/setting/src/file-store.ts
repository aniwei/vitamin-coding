import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { safeStringify } from '@vitamin/shared'
import { createLogger } from '@vitamin/shared'

import type { SettingStore } from './store'
import type { VitaminSetting } from './types'

const logger = createLogger('@vitamin/setting:file-store')

export class FileSettingStore implements SettingStore {
  readonly type = 'file' as const

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

  async write(path: string, config: Partial<VitaminSetting>): Promise<void> {
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
