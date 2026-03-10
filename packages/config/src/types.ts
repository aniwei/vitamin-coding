import type { z } from 'zod'
import type { VitaminConfigFromSchema } from './schema/root'
import type { AgentConfigSchema } from './schema/agents'
import type { CategoryConfigSchema } from './schema/categories'

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
}

// loadConfig() 的返回结果
export interface LoadConfigResult {
  config: VitaminConfig
  // 项目配置文件路径
  projectConfigPath?: string
  // 用户配置文件路径
  userConfigPath?: string
}

// 根配置类型 —— 从 Zod schema 推导，单一来源
export type VitaminConfig = VitaminConfigFromSchema

// 单个 Agent 的配置覆盖 —— 从 Zod schema 推导
export type AgentConfig = z.infer<typeof AgentConfigSchema>

// 单个分类的配置覆盖 —— 从 Zod schema 推导
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>
