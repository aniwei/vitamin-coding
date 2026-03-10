import { ConfigManager } from './manager'

import type { LoadConfigOptions, LoadConfigResult } from './types'

const manager = new ConfigManager()

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  return manager.load(options)
}
