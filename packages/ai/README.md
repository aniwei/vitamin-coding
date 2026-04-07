# @vitamin/ai

## 模块定位
提供模型抽象、Provider 适配、流事件与 Token 统计等 AI 基础能力。

## 当前状态（基于源码）
- 包目录：`packages/ai`
- 源码文件数：13
- 测试文件数：13
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `auth-store.ts`
  - `cost.ts`
  - `event-stream.ts`
  - `index.ts`
  - `model-registry.ts`
  - `model-slot-resolver.ts`
  - `models/`
  - `oauth/`
  - `oauth-registry.ts`
  - `provider/`
  - `provider-registry.ts`
  - `stream.ts`
- `tests/`
  - `api-key-resolver.test.ts`
  - `cost-calculator.test.ts`
  - `event-stream.test.ts`
  - `fallback-chain.test.ts`
  - `github-copilot-oauth.test.ts`
  - `github-copilot-provider.test.ts`
  - `model-registry.test.ts`
  - `model-resolver.test.ts`
  - `model-slot.test.ts`
  - `provider-registry.test.ts`
  - `stream.test.ts`
  - `token-counter.test.ts`

## 公开导出
```ts
export type { Api, KnownProvider, Provider, ProviderStream, Model, ModelSpec, Cost, ThinkingLevel, Compat, TextContent, ImageContent, ThinkingContent, ToolCall, ContentPart, UserMessage, AssistantMessage, ToolResultMessage, Message, StopReason, Usage, StreamEvent, ZodType, ToolDefinition, StreamContext, StreamOptions, OAuthCredentials, OAuthProvider, OAuthLoginOptions, OAuthRefreshTokenOptions, OAuthInfo, OAuthPrompt, OAuthProviderId, } from './types'
export { isClaudeFamily, isGPTFamily, isGeminiFamily, getToolCallsByAssistantMessage, hasToolCalls, emptyUsage, mergeUsage, getTokensFromUsage, } from './types'
export { EventStream, createEventStream } from './event-stream'
export { ModelRegistry, createModelRegistry, createDefaultModelRegistry } from './model-registry'
export { ModelSlot, createModelSlot } from './model-slot-resolver'
export type { WorkflowSlot, ModelSlotOptions } from './model-slot-resolver'
export { createCopilotProvider } from './provider/github-copilot'
export type { CopilotCredentialResolver, CopilotProviderOptions } from './provider/github-copilot'
export { ProviderRegistry, createProviderRegistry, createDefaultProviderRegistry, } from './provider-registry'
export type { DefaultProviderRegistryOptions } from './provider-registry'
export { AuthStore, createAuthStore, createDefaultAuthStore, } from './auth-store'
export type { AuthStoreOptions, ApiKeyEntry, OAuthEntry, AuthEntry, AuthFileData, } from './auth-store'
export { GitHubCopilotOAuthProvider } from './oauth/github-copilot'
export { OAuthRegistry, createOAuthRegistry, createDefaultOAuthRegistry, } from './oauth-registry'
export { stream, complete, simple } from './stream'
export { calculate, CostTracker, createCostTracker } from './cost'
export type { CostBreakdown } from './cost'
```

## 开发命令
- `pnpm --filter @vitamin/ai build`
- `pnpm --filter @vitamin/ai typecheck:project`
- `pnpm --filter @vitamin/ai typecheck:file`
- `pnpm --filter @vitamin/ai typecheck`
- `pnpm --filter @vitamin/ai clean`
- `pnpm --filter @vitamin/ai generate:models`

## 关联 Vitamin 包
- `@vitamin/env`
- `@vitamin/setting`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
