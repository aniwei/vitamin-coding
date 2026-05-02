import type { AgentTool } from '@x-mars/agent'
import type { ToolPreset } from '@x-mars/setting'

export interface ToolMetadata {
  preset: ToolPreset
  category?: string
  builtin: boolean
  pluginId?: string
  // 使用示例（注入 system prompt，帮助 agent 理解调用方式）
  snippet?: string
  // 行为指南（注入 system prompt，约束工具使用规范）
  guideline?: string
  // 延迟加载：不随初始 tool schema 发送，通过 tool_search 激活
  shouldDefer?: boolean
}

export interface RegisteredTool<Args = unknown> extends AgentTool<Args> {
  metadata: ToolMetadata
}

export interface ToolMetadataCoverageIssue {
  toolName: string
  missing: Array<'preset' | 'category' | 'guidance' | 'shouldDefer'>
}

export interface ToolMetadataCoverage {
  total: number
  covered: number
  percent: number
  issues: ToolMetadataCoverageIssue[]
}

export interface ToolRegistrationOptions {
  preset?: ToolPreset
  category?: string
  builtin?: boolean
  pluginId?: string
  snippet?: string
  guideline?: string
  shouldDefer?: boolean
}

export type ToolFactory<Args = unknown> = () => AgentTool<Args>
