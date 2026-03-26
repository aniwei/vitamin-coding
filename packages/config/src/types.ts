import type { z } from 'zod'
import type { VitaminConfigFromSchema } from './schema/root'
import type { AgentConfigSchema } from './schema/agents'
import type { CategoryConfigSchema } from './schema/categories'
import type { ConfigStore } from './store'

// 配置加载/解析过程中产生的警告
export interface ConfigWarning {
  key: string
  message: string
  line?: number
  column?: number
}

// loadConfig() 的选项
export interface LoadConfigOptions {
  // CLI 级别的覆盖项（最高优先级）
  overrides?: Partial<VitaminConfig>
  // 扩展提供的默认值
  extensionDefaults?: Partial<VitaminConfig>
  // 持久化后端（不传则不从文件/远程加载）
  store?: ConfigStore
  // 配置文件搜索路径列表（按优先级从低到高排序）
  // 例如 ['~/.config/vitamin/config.jsonc', './.vitamin/config.jsonc']
  configPaths?: string[]
}

// 根配置类型 —— 从 Zod schema 推导，单一来源
export type VitaminConfig = VitaminConfigFromSchema

// 单个 Agent 的配置覆盖 —— 从 Zod schema 推导
export type AgentConfig = z.infer<typeof AgentConfigSchema>

// 单个分类的配置覆盖 —— 从 Zod schema 推导
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>

// 
export const VITAMIN_DEFAULT_CONFIG: VitaminConfig = {
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
