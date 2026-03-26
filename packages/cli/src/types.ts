// @vitamin/coding-agent 类型定义
import type { VitaminConfig } from '@vitamin/config'
import type { HookRegistry } from '@vitamin/hooks'
import type { AgentRegistry, BackgroundManager, Dispatcher } from '@vitamin/orchestrator'
import type { ToolRegistry } from '@vitamin/tools'
import type { ProviderRegistry } from '@vitamin/ai'

// 运行模式
export type RunMode = 'print' | 'json' | 'rpc' | 'interactive'

// CLI 解析结果
export interface CLIOptions {
  prompt?: string
  model?: string
  mode: RunMode
  configPath?: string
  projectDir: string
  verbose: boolean
  maxTokens?: number
  continueSession?: string
  inspect?: number | true
}

// 子系统集合
export interface Subsystems {
  config: VitaminConfig
  providerRegistry: ProviderRegistry
  toolRegistry: ToolRegistry
  hookRegistry: HookRegistry
  agentRegistry: AgentRegistry
  taskDispatcher: Dispatcher
  backgroundManager: BackgroundManager
  server?: any // Optional inspector server, any typed to avoid circular dependency loop if not needed
}

// AgentSession — 核心会话控制器
export interface AgentSession {
  id: string
  subsystems: Subsystems
  state: AgentSessionState
  prompt: (input: string) => Promise<AgentSessionResult>
  listSessions: () => Promise<SessionSummary[]>
  switchSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  abort: () => void
  getSystemPrompt: () => string
  switchModel: (modelId: string) => void
  compact: () => Promise<void>
  dispose: () => Promise<void>
}

// 会话状态
export interface AgentSessionState {
  currentModel: string
  totalCost: number
  totalTokens: { input: number; output: number }
  messageCount: number
  isRunning: boolean
}

// 会话结果
export interface AgentSessionResult {
  response: string
  cost: number
  tokens: { input: number; output: number }
  toolCalls: ToolCallRecord[]
  duration: number
}

// 工具调用记录
export interface ToolCallRecord {
  name: string
  args: Record<string, unknown>
  result: string
  duration: number
}

// 系统 Prompt 层级（§S12.2）
export interface SystemPromptLayers {
  identity: string
  delegationTable: string
  toolList: string
  projectContext: string
  activeSkills: string
  categoryInfo: string
}

// 资源加载结果
export interface ProjectResources {
  agentsMd: string | null
  rules: string[]
  plans: string[]
  extensions: string[]
}

// 斜杠命令
export interface SlashCommandDef {
  name: string
  description: string
  usage?: string
  handler: (args: string, session: AgentSession) => Promise<string>
}

// 模式接口
export interface ModeRunner {
  run: (session: AgentSession, options: CLIOptions) => Promise<void>
}

// 流式输出事件
export type OutputEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; summary: AgentSessionResult }
  | { type: 'error'; error: string }

// JSON 模式输出
export interface JsonOutput {
  messages: Array<{ role: string; content: string }>
  cost: number
  tokens: { input: number; output: number }
  model: string
  duration: number
}
