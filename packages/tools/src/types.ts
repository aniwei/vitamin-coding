import type { AgentTool } from '@vitamin/agent'
import type { ToolPreset } from '@vitamin/setting'

export interface ToolMetadata {
  preset: ToolPreset
  category?: string
  builtin: boolean
  // 使用示例（注入 system prompt，帮助 agent 理解调用方式）
  snippet?: string
  // 行为指南（注入 system prompt，约束工具使用规范）
  guideline?: string
}

export interface RegisteredTool<Args = unknown> extends AgentTool<Args> {
  metadata: ToolMetadata
}

export interface ToolRegistrationOptions {
  preset?: ToolPreset
  category?: string
  builtin?: boolean
  snippet?: string
  guideline?: string
}

export type ToolFactory<Args = unknown> = () => AgentTool<Args>
