import type { SettingStore } from './store'
import { WORKFLOW_SLOTS, type WorkflowSlot } from '@x-mars/ai'

export { WORKFLOW_SLOTS }

export interface AgentOptions {
  model?: string
  description?: string
  system_prompt?: string
  tools?: string[]
  capabilities?: string[]
  categories?: string[]
  default_workflow_slot?: WorkflowSlot
  max_tool_turns?: number
  temperature?: number
  max_tokens?: number
  thinking_budget?: number
  disabled?: boolean
  [key: string]: unknown
}

export type AgentsConfig = Record<string, AgentOptions>

/** 内置 reviewer agent 预设 */
export const BUILTIN_REVIEWER_AGENTS: Record<string, AgentOptions> = {
  'spec-reviewer': {
    description: 'Reviews implementation against specification requirements',
    categories: ['review'],
    default_workflow_slot: 'critique',
  },
  'quality-reviewer': {
    description: 'Reviews code quality, patterns, and best practices',
    categories: ['review'],
    default_workflow_slot: 'critique',
  },
}

export interface CategoryConfig {
  preferred_models?: string[]
  default_model?: string
  [key: string]: unknown
}

export type CategoriesConfig = Record<string, CategoryConfig>

export const COMPACTION_STRATEGIES = ['summary', 'sliding-window', 'incremental'] as const

export type CompactionStrategy = (typeof COMPACTION_STRATEGIES)[number]

export interface CompactionConfig {
  strategy?: CompactionStrategy
  retain_recent?: number
  auto_compact?: boolean
  threshold_tokens?: number
  preserve_todos?: boolean
  [key: string]: unknown
}

export interface BackgroundTaskConfig {
  concurrency?: number
  enabled?: boolean
  [key: string]: unknown
}

export interface GatewayConfig {
  enabled?: boolean
  webhookSecret?: string
  webhook_secret?: string
  deliveryUrl?: string
  delivery_url?: string
  deliverySecret?: string
  delivery_secret?: string
  deliverySigningSecret?: string
  delivery_signing_secret?: string
  deliveryRetries?: number
  delivery_retries?: number
  [key: string]: unknown
}

export interface ExperimentalConfig {
  features?: Record<string, boolean>
  background_task?: BackgroundTaskConfig
  [key: string]: unknown
}

export interface ModelSlotConfig {
  slots?: Partial<Record<WorkflowSlot, string | string[]>>
  default?: string
  [key: string]: unknown
}

export interface NotificationConfig {
  enabled?: boolean
  sound?: boolean
  on_completion?: boolean
  on_error?: boolean
  on_idle?: boolean
  [key: string]: unknown
}

export interface SessionConfig {
  max_turns?: number
  max_tokens?: number
  auto_compact?: boolean
  [key: string]: unknown
}

export const TOOL_PRESETS = ['minimal', 'standard', 'full'] as const

export type ToolPreset = (typeof TOOL_PRESETS)[number]

export interface ToolsConfig {
  tool_preset?: ToolPreset
  disabled_tools?: string[]
  [key: string]: unknown
}

export interface WorkflowReview {
  enabled?: boolean
  [key: string]: unknown
}

export interface WorkflowRetry {
  enabled?: boolean
  maxAttempts?: number
  [key: string]: unknown
}

export interface WorkflowCircuitBreaker {
  enabled?: boolean
  failureThreshold?: number
  /** ms */
  timeoutMs?: number
  [key: string]: unknown
}

export interface WorkflowRouting {
  enabled?: boolean
  [key: string]: unknown
}

export interface WorkflowOptions {
  enabled?: boolean
  maxActiveTasks?: number
  max_active_tasks?: number
  review?: WorkflowReview
  retry?: WorkflowRetry
  circuitBreaker?: WorkflowCircuitBreaker
  routing?: WorkflowRouting
  [key: string]: unknown
}

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export const PERMISSION_MODES = ['bypass', 'auto', 'confirm', 'strict', 'readonly'] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

export interface PermissionRuleConfig {
  name: string
  effect: 'allow' | 'deny' | 'ask'
  match?: string
  tools?: string[]
  paths?: string[]
  deny_reason?: string
  ask_prompt?: string
}

export interface PermissionPolicySetting {
  name: string
  priority?: number
  enabled?: boolean
  scope?: {
    agents?: string[]
    sessions?: string[]
  }
  rules: PermissionRuleConfig[]
}

export interface CommandHookMatcherSetting {
  tools?: string[]
  agents?: string[]
}

export interface CommandHookSetting {
  name: string
  command: string
  timing?: 'tool.execute.before'
  matcher?: CommandHookMatcherSetting
  env?: Record<string, string>
  timeout_ms?: number
  timeoutMs?: number
  priority?: number
  enabled?: boolean
  cancel_on_non_zero_exit?: boolean
  cancelOnNonZeroExit?: boolean
}

export interface XMarsSettingFromSchema {
  config_version?: string
  version?: string
  log_level?: LogLevel
  model?: string
  model_fallback?: string[]
  theme?: string
  agents?: AgentsConfig
  categories?: CategoriesConfig
  tool_preset?: ToolPreset
  session?: SessionConfig
  compaction?: CompactionConfig
  notification?: NotificationConfig
  workflow?: WorkflowOptions
  model_slots?: ModelSlotConfig
  background_task?: BackgroundTaskConfig
  gateway?: GatewayConfig
  experimental?: ExperimentalConfig
  disabled_agents?: string[]
  disabled_hooks?: string[]
  disabled_tools?: string[]
  permission_mode?: PermissionMode
  permissions?: PermissionPolicySetting[]
  command_hooks?: CommandHookSetting[]
  _migrations?: string[]
  [key: string]: unknown
}

export const X_MARS_SETTING_KEYS = [
  'config_version',
  'version',
  'log_level',
  'model',
  'model_fallback',
  'theme',
  'agents',
  'categories',
  'tool_preset',
  'session',
  'compaction',
  'notification',
  'workflow',
  'model_slots',
  'background_task',
  'gateway',
  'experimental',
  'disabled_agents',
  'disabled_hooks',
  'disabled_tools',
  'permission_mode',
  'permissions',
  'command_hooks',
  '_migrations',
] as const

export type XMarsSettingKey = (typeof X_MARS_SETTING_KEYS)[number]

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

export type XMarsSetting = XMarsSettingFromSchema

export const X_MARS_DEFAULT_CONFIG: XMarsSetting = {
  config_version: '1.0.0',
  log_level: 'info',
  model: undefined,
  theme: 'auto',
  tool_preset: 'full',
  agents: { ...BUILTIN_REVIEWER_AGENTS },
  categories: {},
  session: {},
  compaction: {},
  workflow: {},
  background_task: {},
  gateway: {},
  experimental: {},
  disabled_agents: [],
  disabled_hooks: [],
  disabled_tools: [],
  permission_mode: 'auto',
  permissions: [],
  command_hooks: [],
}
