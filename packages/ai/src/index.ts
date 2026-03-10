// @vitamin/ai — 统一 LLM API 层

// 核心类型
export type {
  Api,
  KnownProvider,
  Provider,
  ProviderStream,
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

// 模型注册表
export { ModelRegistry, createModelRegistry } from './model-registry'

// Provider
export { createCopilotProvider } from './provider/github-copilot'

// OAuth
export { GitHubCopilotOAuth } from './oauth/github-copilot'
export { OAuthRegistry, createOAuthRegistry } from './oauth-registry'

// 流式入口
export { stream, complete, simple } from './stream'

// 费用计算
export { calculate, CostTracker, createCostTracker } from './cost'
export type { CostBreakdown } from './cost'

