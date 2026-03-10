

import { homedir } from 'node:os'
import * as path from 'node:path'
import type { VitaminConfig } from './types'

export const PROJ_DIR = process.cwd()
export const USER_DIR = path.join(homedir(), '.config', 'vitamin')

export const PROJ_CONFIG_PATH = path.join(PROJ_DIR, '.vitamin', 'config.jsonc')
export const USER_CONFIG_PATH = path.join(USER_DIR, 'config.jsonc')


export const VITAMIN_CONFIG: VitaminConfig = {
  config_version: '1.0.0',
  log_level: 'info',
  model: undefined,
  theme: 'auto',
  tool_preset: 'standard',
  agents: {},
  categories: {},
  extensions: {},
  mcp: {},
  session: {},
  skills: {},
  compaction: {},
  background_task: {},
  experimental: {},
  disabled_agents: [],
  disabled_hooks: [],
  disabled_mcps: [],
  disabled_skills: [],
  disabled_tools: [],
}
