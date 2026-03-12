// 工具类型定义
import type { AgentTool } from '@vitamin/agent'

// 工具预设名称
export type ToolPreset = 'minimal' | 'standard' | 'full'

// 工具元数据（注册时的额外信息）
export interface ToolMetadata {
  // 工具所属预设
  preset: ToolPreset
  // 工具分类标签
  category?: string
  // 是否为内置工具
  builtin: boolean
}

// 注册的工具（AgentTool + 元数据）
export interface RegisteredTool<Args = unknown> extends AgentTool<Args> {
  metadata: ToolMetadata
}

// 工具注册选项
export interface ToolRegistrationOptions {
  preset?: ToolPreset
  category?: string
  builtin?: boolean
}

// 工具工厂函数类型
export type ToolFactory<Args = unknown> = () => AgentTool<Args>

// 工具上下文 — 工具执行时的环境信息
export interface ToolContext {
  // 项目根目录
  projectRoot: string
  // 当前工作目录
  cwd: string
  // AbortSignal
  signal: AbortSignal
}

export type SkillLoader = (path: string) => Promise<{
  success: boolean
  name?: string
  error?: string
}>

export type SkillMcp = (server: string, tool: string, args?: Record<string, unknown>) => Promise<{
  success: boolean
  result?: unknown
  error?: string
}>

export type SkillExecutor = (name: string, input?: string, params?: Record<string, string>) => Promise<{
  success: boolean
  output?: string
  error?: string
}>

export interface RegisterSkillOptions {
  mcp?: SkillMcp
  loader?: SkillLoader
  executor?: SkillExecutor
}

export interface TaskOptions {
  
}

export interface RegisterBuiltinOptions {}