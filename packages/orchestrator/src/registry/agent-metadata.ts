// Agent 元数据 — 模型优先级和工具限制常量
import type { AgentPromptMetadata } from '../types'

// Agent 模型优先级链 (来源: DEVELOPMENT-SPEC.md §S7.8)
export const AGENT_MODEL_PRIORITY: Record<string, string[]> = {
  'central-secretariat': ['claude-opus-4-6', 'gpt-5.2', 'kimi-k2.5', 'gemini-3.1-pro'],
  hephaestus: ['gpt-5.3-codex', 'claude-opus-4-6', 'gemini-3.1-pro', 'copilot-sonnet'],
  prometheus: ['claude-opus-4-6', 'gpt-5.2', 'kimi-k2.5', 'gemini-3.1-pro'],
  oracle: ['gpt-5.2(high)', 'claude-opus-4-6', 'gemini-3.1-pro'],
  momus: ['gpt-5.2(low)', 'claude-sonnet-4-6', 'gemini-3-flash'],
  atlas: ['kimi-k2.5', 'claude-sonnet-4-6', 'gemini-3-flash'],
  metis: ['claude-opus-4-6', 'gpt-5.2', 'gemini-3.1-pro'],
  explore: ['grok-code-fast(FREE)', 'gemini-3-flash', 'kimi-k2.5'],
  librarian: ['gemini-3-flash', 'kimi-k2.5', 'copilot-sonnet', 'claude-sonnet'],
  roundtable: ['claude-opus-4-6(max)', 'gpt-5.2(high)', 'kimi-k2.5', 'gemini-3.1-pro'],
  'sisyphus-junior': ['claude-haiku-4-5', 'gpt-4.1-mini', 'gemini-3-flash'],
  'multimodal-looker': ['claude-sonnet-4-6', 'gemini-3.1-pro', 'gpt-5.2'],
}

// Agent 工具限制表 (来源: DEVELOPMENT-SPEC.md §S5.3)
export const AGENT_TOOL_RESTRICTIONS: Record<string, { allowed?: string[]; denied?: string[] }> = {
  explore: { allowed: ['read', 'grep', 'glob', 'find', 'ls', 'ast-grep'] },
  oracle: { allowed: ['read', 'grep', 'glob', 'find', 'ls', 'ast-grep'] },
  librarian: { allowed: ['read', 'grep', 'glob', 'mcp:websearch:*', 'mcp:context7:*'] },
  atlas: { denied: ['write', 'edit', 'edit-diff', 'bash'] },
}

// Agent 元数据定义 (来源: DEVELOPMENT-SPEC.md §S7.5)
export const AGENT_METADATA: Record<string, AgentPromptMetadata> = {
  'central-secretariat': {
    category: 'orchestrator',
    cost: 'EXPENSIVE',
    triggers: [
      { domain: 'general', trigger: '默认复杂任务编排器' },
    ],
    useWhen: ['复杂多步骤任务', '需要委派的任务'],
    executionMode: 'sync',
  },
  hephaestus: {
    category: 'specialist',
    cost: 'EXPENSIVE',
    triggers: [
      { domain: 'code', trigger: '重构|重新设计|实现|构建' },
    ],
    useWhen: ['深度实现工作', '大型重构'],
    executionMode: 'both',
  },
  explore: {
    category: 'exploration',
    cost: 'CHEAP',
    triggers: [
      { domain: 'search', trigger: '查找|搜索|定位|哪里|哪个' },
    ],
    useWhen: ['代码库探索', '查找文件或模式'],
    avoidWhen: ['需要写入的任务'],
    executionMode: 'both',
  },
  oracle: {
    category: 'advisor',
    cost: 'MODERATE',
    triggers: [
      { domain: 'strategy', trigger: '解释|分析|审查|评估' },
    ],
    useWhen: ['策略分析', '代码审查', '架构决策'],
    avoidWhen: ['需要写入的任务'],
    executionMode: 'sync',
  },
  librarian: {
    category: 'exploration',
    cost: 'CHEAP',
    triggers: [
      { domain: 'knowledge', trigger: '文档|API|库|文档' },
    ],
    useWhen: ['外部知识查找', 'API 文档'],
    avoidWhen: ['需要写入的任务'],
    executionMode: 'both',
  },
  'sisyphus-junior': {
    category: 'utility',
    cost: 'CHEAP',
    triggers: [
      { domain: 'quick', trigger: '快速|简单|小型|快速' },
    ],
    useWhen: ['快速类别任务', '小型独立任务'],
    executionMode: 'both',
  },
  prometheus: {
    category: 'specialist',
    cost: 'EXPENSIVE',
    triggers: [
      { domain: 'planning', trigger: '计划|设计|架构|提议' },
    ],
    useWhen: ['复杂任务规划', '结构化计划生成'],
    avoidWhen: ['简单任务', '直接实现'],
    executionMode: 'sync',
  },
  momus: {
    category: 'advisor',
    cost: 'MODERATE',
    triggers: [
      { domain: 'review', trigger: '审查|验证|批准' },
    ],
    useWhen: ['计划审查', '质量门检查'],
    executionMode: 'sync',
  },
  metis: {
    category: 'advisor',
    cost: 'MODERATE',
    triggers: [
      { domain: 'analysis', trigger: '分析|评估|评价|复杂性' },
    ],
    useWhen: ['规划前分析', '复杂性评估'],
    executionMode: 'sync',
  },
  atlas: {
    category: 'orchestrator',
    cost: 'MODERATE',
    triggers: [
      { domain: 'execution', trigger: '执行|开始工作|运行计划' },
    ],
    useWhen: ['计划执行', '并行任务编排'],
    avoidWhen: ['没有计划的任务'],
    executionMode: 'sync',
  },
  'multimodal-looker': {
    category: 'utility',
    cost: 'MODERATE',
    triggers: [
      { domain: 'visual', trigger: '截图|图像|查看|视觉|UI' },
    ],
    useWhen: ['截图分析', '视觉检查', 'UI 验证'],
    executionMode: 'sync',
  },
}
