// @vitamin/ai — 统一 LLM API 层

// 核心类型
export type {
  Api,
  KnownProvider,
  Model,
  Cost,
  ThinkingLevel,
  Compat,
  TextContent,
  ImageContent,
  ThinkingContent,
  ToolCall,
  ContentPart,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
  StopReason,
  Usage,
  StreamEvent,
  ZodType,
  ToolDefinition,
  StreamContext,
  StreamOptions,
} from './types'
export {
  isGptFamily,
  isClaudeFamily,
  isGeminiFamily,
  getToolCalls,
  hasToolCalls,
  emptyUsage,
  mergeUsage,
} from './types'

// EventStream
export { EventStream, createEventStream } from './event-stream'

// HTTP/WS 传输（可被 Provider 直接使用）
export { wsStreamRequest } from './utils/ws-client'
export type { WsStreamOptions, WsConnectOptions } from './utils/ws-client'

// 模型注册表
export { ModelRegistry, createModelRegistry } from './model-registry'
export { BUILTIN_MODELS } from './models'

// Provider
export { createCopilotProvider } from './builtin-provider/github-copilot'

// 流式入口
export { stream, complete, streamSimple } from './stream'
export type { StreamOrchestratorOptions } from './stream'

// Category + 模型解析
export {
  resolveModel,
  BUILTIN_CATEGORIES,
  SYSTEM_FALLBACK_CHAIN,
  modelMeetsRequirements,
} from './model-resolver'
export type { Category, ResolverConfig } from './model-resolver'

// Fallback 链
export { streamWithFallback, DEFAULT_FALLBACK_CONFIG } from './fallback-chain'
export type { FallbackChainConfig, FallbackEvent, SleepFn } from './fallback-chain'

// 费用计算
export { calculate, CostTracker, createCostTracker } from './cost'
export type { CostBreakdown } from './cost'

// API Key 解析
export { resolveApiKey } from './api-key-resolver'
export type { ApiKeyResolverOptions, ApiKeyGetter } from './api-key-resolver'

// Token 估算
export { estimateTokenCount, estimateMessagesTokens } from './utils/token-counter'
export { toToolJsonSchema, toGeminiToolJsonSchema } from './utils/tool-schema'
