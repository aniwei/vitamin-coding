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
  // 使用示例（注入 system prompt，帮助 agent 理解调用方式）
  snippet?: string
  // 行为指南（注入 system prompt，约束工具使用规范）
  guideline?: string
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
  snippet?: string
  guideline?: string
}

// 工具工厂函数类型
export type ToolFactory<Args = unknown> = () => AgentTool<Args>
