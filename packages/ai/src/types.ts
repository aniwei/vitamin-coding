// @vitamin/ai 核心类型定义
// 涵盖 Model, Message, StreamEvent, ToolDefinition, StreamContext 等

type Timestamp = number // Unix 时间戳（毫秒）

// 已知 API 协议类型
export type KnownApi =
	| "openai-completions"
	| "openai-responses"
	| "azure-openai-responses"
	| "openai-codex-responses"
	| "anthropic-messages"
	| "bedrock-converse-stream"
	| "google-generative-ai"
	| "google-gemini-cli"
	| "google-vertex";

export type Api = KnownApi | (string & {});

// 已知提供商
export type KnownProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'amazon-bedrock'
  | 'github-copilot'
  | 'xai'
  | 'groq'
  | 'openrouter'
  | 'deepseek'
  | 'ollama'
  | 'moonshot'
  | 'custom'

export type Provider = KnownProvider | string

// 思维级别
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

// 停止原因
export type StopReason = 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence'

// Provider 兼容性覆盖
export interface Compat {
  // TODO
}

// Token 使用量
export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

// 模型费率（每百万 token）
export interface Cost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// 模型定义 — 核心数据结构
export interface Model<T = Api> {
  id: string
  name: string
  api: T
  provider: Provider
  baseUrl: string
  reasoning: boolean // 是否支持推理（thinking/reasoning）
  input: ('text' | 'image')[]
  cost: Cost
  contextWindow: number
  maxOutputTokens: number
  thinkingLevels?: ThinkingLevel[]
  transport?: 'sse' | 'websocket' | 'auto'
  compat?: Compat
}

// 统一内容部分类型
export interface TextContent {
  type: 'text'
  data: string
  signature?: string // 可选签名，用于内容验证或追踪
}

export interface ImageContent {
  type: 'image'
  mime: string
  data: string // Base64 编码的图像数据
}

export interface ThinkingContent {
  type: 'thinking'
  data: string
  signature?: string
}

export interface ToolCall {
  type: 'tool_call'
  id: string // 唯一 ID，便于流式更新
  name: string
  arguments: Record<string, unknown>
}

export type ContentPart = TextContent | ImageContent | ThinkingContent | ToolCall

// 统一消息类型
export interface UserMessage {
  role: 'user'
  content: string | ContentPart[]
  timestamp: Timestamp
}

export interface AssistantMessage {
  role: 'assistant'
  content: (TextContent | ThinkingContent | ToolCall)[]
  api: Api
  provider: Provider
  model: string
  usage: Usage
  // TODO
  stopReason: StopReason
}

export interface ToolResultMessage<T extends unknown = unknown> {
  role: 'tool_result'
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  details: T
  isError: boolean
  timestamp: Timestamp
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage

export type StreamEvent =
  | { type: 'start'; partial: AssistantMessage }
	| { type: 'text_start'; index: number; partial: AssistantMessage }
	| { type: 'text_delta'; index: number; delta: string; partial: AssistantMessage }
	| { type: 'text_end'; index: number; content: string; partial: AssistantMessage }
	| { type: 'thinking_start'; index: number; partial: AssistantMessage }
	| { type: 'thinking_delta'; index: number; delta: string; partial: AssistantMessage }
	| { type: 'thinking_end'; index: number; content: string; partial: AssistantMessage }
	| { type: 'tool_call_start'; index: number; partial: AssistantMessage }
	| { type: 'tool_call_delta'; index: number; delta: string; partial: AssistantMessage }
	| { type: 'tool_call_end'; index: number; toolCall: ToolCall; partial: AssistantMessage }
	| { type: 'done'; reason: Extract<StopReason, "stop" | "length" | "tool_use">; message: AssistantMessage }
	| { type: 'error'; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

// Zod schema 类型占位（避免直接依赖 zod）
export interface ZodType<T = unknown> {
  parse(data: unknown): T
  safeParse(data: unknown): { success: boolean; data?: T; error?: unknown }
  toJSONSchema?: () => unknown
}

// 工具定义 — 使用 Zod schema
export interface ToolDefinition<TArgs = unknown> {
  name: string
  description: string
  parameters: ZodType<TArgs>
  // 工具可见性控制
  visibility?: 'always' | 'when-enabled' | 'when-requested'
}

// 流式上下文
export interface StreamContext {
  systemPrompt: string
  messages: Message[]
  tools?: ToolDefinition[]
  thinkingLevel?: ThinkingLevel
  maxTokens?: number
  temperature?: number
  cacheRetention?: 'none' | 'short' | 'long'
}

// 流式选项
export interface StreamOptions {
  signal?: AbortSignal
  maxRetries?: number
  timeout?: number
  proxy?: string
}

// 用于辅助判断模型家族
export function isGptFamily(model: Model): boolean {
  return (
    model.provider === 'openai' ||
    model.api === 'openai-completions' ||
    model.api === 'openai-responses'
  )
}

export function isClaudeFamily(model: Model): boolean {
  return model.provider === 'anthropic' || model.api === 'anthropic-messages'
}

export function isGeminiFamily(model: Model): boolean {
  return model.provider === 'google' || model.api === 'google-generative-ai'
}

// 从 AssistantMessage 提取工具调用
export function getToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter((c): c is ToolCall => c.type === 'tool_call')
}

// 检查 AssistantMessage 是否包含工具调用
export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some((c) => c.type === 'tool_call')
}

// 创建空的 Usage
export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

// 合并两个 Usage
export function mergeUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

// Provider 适配器接口
export interface ProviderStream {
  // 唯一标识
  readonly id: string
  readonly displayName: string

  // 流式调用（核心方法）
  converse(
    model: Model<Api>,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent>

  key(): Promise<string>

  // 平台健康检查
  healthCheck?(key: string): Promise<boolean>
}

// Provider 工厂函数类型
export type ProviderFactory = () => ProviderStream

export type OAuthStore = {
  type: 'oauth'
  refreshToken: string
  accessToken: string
  expires: number
}

// OAuth 适配器接口
export interface OAuth {
  // 唯一标识
  readonly id: string
  readonly displayName: string

  authorize(
    model: Model<Api>,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent>
}

export type OAuthFactory = () => OAuth
