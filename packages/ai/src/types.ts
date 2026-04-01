type Timestamp = number // Unix 时间戳（毫秒）

// 已知 API 协议类型
export type KnownApi =
	| 'openai-completions'
	| 'openai-responses'
	| 'azure-openai-responses'
	| 'openai-codex-responses'
	| 'anthropic-messages'
	| 'bedrock-converse-stream'
	| 'google-generative-ai'
	| 'google-gemini-cli'
	| 'google-vertex'

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

export type ModelSpec = string | { provider: string; name: string; api?: Api } | Model

export interface TextContent {
  type: 'text'
  text: string
  signature?: string 
}

export interface ImageContent {
  type: 'image'
  mime: string
  source: string 
}

export interface ThinkingContent {
  type: 'thinking'
  text: string
  signature?: string
}

export interface ToolCall {
  type: 'tool_call'
  id: string 
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
	| { type: 'done'; reason: StopReason; message: AssistantMessage }
	| { type: 'error'; error: Error };

export interface ZodType<T = unknown> {
  parse(data: unknown): T
  safeParse(data: unknown): { success: boolean; data?: T; error?: unknown }
  toJSONSchema?: () => unknown
}

export interface ToolDefinition<TArgs = unknown> {
  name: string
  description: string
  parameters: ZodType<TArgs>
  visibility?: 'always' | 'when-enabled' | 'when-requested'
}

export interface StreamContext {
  systemPrompt: string
  messages: Message[]
  tools?: ToolDefinition[]
  thinkingLevel?: ThinkingLevel
  maxTokens?: number
  temperature?: number
  cacheRetention?: 'none' | 'short' | 'long'
}

export interface StreamOptions {
  signal?: AbortSignal
  maxRetries?: number
  timeout?: number
  proxy?: string
}

export interface ProviderStream {
  readonly id: string
  readonly displayName: string
  
  resolveKey?(model: Model): Promise<string>

  converse(
    model: Model<Api>,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent>

  healthCheck?(token: string): Promise<boolean>
}

export type ProviderFactory = () => ProviderStream

export type OAuthCredentials = {
  refresh: string          
  access: string           
  expires: number          
  [key: string]: unknown   
}

export type OAuthProviderId = string

export interface OAuthInfo {
  url: string
  code?: string 
  instructions?: string
}

export interface OAuthPrompt {
  message: string
  placeholder?: string
  allowEmpty?: boolean
}

export interface OAuthLoginOptions {
  onAuth: (info: OAuthInfo) => void
  onPrompt: (prompt: OAuthPrompt) => Promise<string>
  onProgress?: (message: string) => void
  onManualCode?: () => Promise<string>
  signal?: AbortSignal
}

export interface OAuthRefreshTokenOptions extends OAuthCredentials{
  domain?: string
}

export interface OAuthProvider {
  readonly id: OAuthProviderId
  readonly name: string

  usesCallbackServer?: boolean

  login(options: OAuthLoginOptions): Promise<OAuthCredentials>
  refreshToken(options: OAuthRefreshTokenOptions): Promise<OAuthCredentials>
  getAccessKey(credentials: OAuthCredentials): string
}

export type OAuthProviderFactory = () => OAuthProvider

export function isGPTFamily(model: Model): boolean {
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

export function getToolCallsByAssistantMessage(message: AssistantMessage): ToolCall[] {
  return message.content.filter((c): c is ToolCall => c.type === 'tool_call')
}

export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some(c => c.type === 'tool_call')
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

export function mergeUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

export function getTokensFromUsage(message: Message): number | null {
  if (message.role !== 'assistant') return null
  const usage = (message as AssistantMessage).usage
  if (!usage) return null
  return usage.inputTokens + usage.outputTokens
}