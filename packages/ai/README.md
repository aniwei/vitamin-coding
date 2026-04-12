# @vitamin/ai

## 模块定位

提供模型抽象、Provider 适配、流事件处理与 Token 统计等 AI 基础能力。通过 Registry 模式实现多厂商模型的统一接入。

## 核心功能

| 模块                   | 功能                                                            |
| ---------------------- | --------------------------------------------------------------- |
| ModelRegistry          | 模型注册、解析、默认模型管理                                    |
| ProviderRegistry       | Provider 工厂注册与实例化（内置 github-copilot）                |
| ModelSlot              | 工作流插槽（normal/thinking/compact/critique/vision）映射到模型 |
| AuthStore              | API Key + OAuth 双模式认证存储                                  |
| EventStream            | 自定义 AsyncIterable，支持背压控制                              |
| stream/complete/simple | 流式 LLM 调用封装                                               |
| CostTracker            | 基于 token 的费用计算与累计                                     |
| OAuthRegistry          | OAuth Provider 管理（内置 GitHub Copilot Device Flow）          |

## 目录概览

```
src/
  types.ts               # 核心类型
  model-registry.ts       # 模型注册表
  model-slot-resolver.ts  # 插槽解析
  provider-registry.ts    # Provider 注册
  auth-store.ts           # 认证存储
  oauth-registry.ts       # OAuth 管理
  event-stream.ts         # 事件流
  stream.ts               # 流式调用
  cost.ts                 # 费用计算
  provider/
    github-copilot.ts     # Copilot Provider
  oauth/
    github-copilot.ts     # Copilot OAuth
  models/
    index.ts              # 模型定义
tests/                    # 13 个测试文件
```

## 公开导出

```ts
// 类型
export type {
  Api,
  Provider,
  Model,
  StreamEvent,
  StreamContext,
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  OAuthProvider,
  OAuthCredentials,
  ToolDefinition,
  ZodType,
}
// 模型注册
export { ModelRegistry, createModelRegistry, createDefaultModelRegistry }
export { ModelSlot, createModelSlot }
// Provider
export { ProviderRegistry, createProviderRegistry, createDefaultProviderRegistry }
export { createCopilotProvider }
// 认证
export { AuthStore, createAuthStore, createDefaultAuthStore }
export { OAuthRegistry, createOAuthRegistry, createDefaultOAuthRegistry }
export { GitHubCopilotOAuthProvider }
// 流式调用
export { EventStream, createEventStream }
export { stream, complete, simple }
// 费用
export { calculate, CostTracker, createCostTracker }
// 工具
export { isClaudeFamily, isGPTFamily, isGeminiFamily, hasToolCalls, mergeUsage }
```

## 开发命令

```bash
pnpm --filter @vitamin/ai build
pnpm --filter @vitamin/ai typecheck
pnpm --filter @vitamin/ai generate:models
pnpm --filter @vitamin/ai clean
```

## 关联包

`@vitamin/setting`、`@vitamin/env`、`@vitamin/shared`
