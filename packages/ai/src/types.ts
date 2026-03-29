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

// 模型规格 — 用于模型解析入口
// 支持三种形态：
//   1. 字符串 id，如 "github-copilot/gpt-4.1"
//   2. 轻量对象 { provider, name, api? }
//   3. 完整 Model 对象
export type ModelSpec = string | { provider: string; name: string; api?: Api } | Model

// 统一内容部分类型
export interface TextContent {
  type: 'text'
  text: string
  signature?: string // 可选签名，用于内容验证或追踪
}

export interface ImageContent {
  type: 'image'
  mime: string
  source: string // Base64 编码的图像数据
}

export interface ThinkingContent {
  type: 'thinking'
  text: string
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
	| { type: 'done'; reason: StopReason; message: AssistantMessage }
	| { type: 'error'; error: Error };

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

// Provider 适配器接口
export interface ProviderStream {
  // 唯一标识
  readonly id: string
  readonly displayName: string
  
  resolveKey?(model: Model): Promise<string>

  // 流式调用（核心方法）
  converse(
    model: Model<Api>,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent>

  // 平台健康检查
  healthCheck?(token: string): Promise<boolean>
}

// Provider 工厂函数类型
export type ProviderFactory = () => ProviderStream

// OAuth 凭据 — 与 pi-mono 对齐：refresh / access / expires + 可扩展字段
export type OAuthCredentials = {
  refresh: string          // GitHub OAuth access_token / 其他 provider 的 refresh token
  access: string           // Copilot token / 最终 API key
  expires: number          // 毫秒时间戳，access 过期时间
  [key: string]: unknown   // 扩展字段（如 enterpriseUrl）
}

export type OAuthProviderId = string

// OAuth 回调：用于 UI 层展示认证信息和收集输入
export interface OAuthInfo {
  url: string
  code?: string // 可选，某些 provider 可能不需要用户输入 code
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
  // 手动输入授权码（用于 callback server 类 OAuth 提供商的备用输入）
  onManualCode?: () => Promise<string>
  signal?: AbortSignal
}

export interface OAuthRefreshTokenOptions extends OAuthCredentials{
  domain?: string
}

// OAuth 提供商接口 — 无状态、纯函数式
export interface OAuthProvider {
  readonly id: OAuthProviderId
  readonly name: string

  // 是否使用本地回调服务器登录（支持 onManualCode 备用输入）
  usesCallbackServer?: boolean

  // 运行交互式登录流程，返回凭据
  login(options: OAuthLoginOptions): Promise<OAuthCredentials>

  // 刷新过期凭据 
  refreshToken(options: OAuthRefreshTokenOptions): Promise<OAuthCredentials>

  // 从凭据提取 Access key
  getAccessKey(credentials: OAuthCredentials): string
}

export type OAuthProviderFactory = () => OAuthProvider

// 用于辅助判断模型家族
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

// 从 AssistantMessage 提取工具调用
export function getToolCallsByAssistantMessage(message: AssistantMessage): ToolCall[] {
  return message.content.filter((c): c is ToolCall => c.type === 'tool_call')
}

// 检查 AssistantMessage 是否包含工具调用
export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some(c => c.type === 'tool_call')
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

// 从 AssistantMessage.usage 获取精确 token 总数
export function getTokensFromUsage(message: Message): number | null {
  if (message.role !== 'assistant') return null
  const usage = (message as AssistantMessage).usage
  if (!usage) return null
  return usage.inputTokens + usage.outputTokens
}