import type { z } from 'zod'
import type { VitaminSettingFromSchema } from './schema/root'
import type { AgentConfigSchema } from './schema/agents'
import type { CategoryConfigSchema } from './schema/categories'
import type { SettingStore } from './store'

// 配置加载/解析过程中产生的警告
export interface SettingWarning {
  key: string
  message: string
  line?: number
  column?: number
}
export type ConfigWarning = SettingWarning

export interface LoadSettingOptions {
  store?: SettingStore
  paths?: string[]
}
export type LoadConfigOptions = LoadSettingOptions

export type VitaminSetting = VitaminSettingFromSchema

export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>

// 
export const VITAMIN_DEFAULT_CONFIG: VitaminSetting = {
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
  workflow: {},
  background_task: {},
  experimental: {},
  disabled_agents: [],
  disabled_hooks: [],
  disabled_mcps: [],
  disabled_skills: [],
  disabled_tools: [],
}
