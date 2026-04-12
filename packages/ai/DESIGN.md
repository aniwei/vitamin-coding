# @vitamin/ai 设计说明

## 设计目标

- 提供模型抽象、Provider 适配、流事件处理与 Token 统计等 AI 基础能力。
- 通过 Provider Registry + Model Registry 实现多厂商模型的统一接入。
- 支持 OAuth 认证流（GitHub Copilot Device Flow）和 API Key 双模式。

## 非目标

- 不实现具体的 Agent 执行循环（由 `@vitamin/agent` 承担）。
- 不直接管理会话状态。

## 实现原理

### 模型注册表（model-registry.ts）

`ModelRegistry` 管理模型定义的注册、查询和解析。每个 `Model` 包含 id、api 协议、provider、baseUrl、contextWindow、cost 定价、思考级别等信息。支持 `resolve(nameOrId)` 按名称或 ID 解析模型，`setDefault()` 设置默认模型。

### Provider 注册表（provider-registry.ts）

`ProviderRegistry` 管理 Provider 工厂函数的注册与实例化。每个 `ProviderStream` 实现 `converse()` 方法返回 `AsyncIterable<StreamEvent>`。内置 `github-copilot` Provider。支持 `resolveAccessKey()` 和 `hasCredential()` 进行认证状态检查。

### 模型插槽解析（model-slot-resolver.ts）

`ModelSlot` 将工作流插槽（`normal` / `thinking` / `compact` / `critique` / `vision`）映射到具体模型规格。支持单模型或数组回退链，未配置的 slot 回退到默认模型。

### 认证存储（auth-store.ts）

`AuthStore` 统一管理 API Key 和 OAuth 凭证。支持：

- `getCredentialKey()`：解析 token（OAuth 自动刷新过期 token）
- `login()` / `logout()`：OAuth 认证流
- 环境变量映射：将 provider 名称映射到 `ANTHROPIC_API_KEY` 等环境变量
- 文件持久化：`chmod 0o600` 保护凭证文件

### 事件流（event-stream.ts）

`EventStream<E, R>` 自定义 AsyncIterable 实现，支持背压控制和等待者队列模式。`push(event)` 发射事件，`complete(result)` 完成流，`fail(error)` 报错，`abort()` 中止。

### 流式调用（stream.ts）

- `stream()`：发起异步流式 LLM 调用，返回 EventStream，管理 abort signal 和 provider 流生命周期。
- `complete()`：便捷封装，等待完整响应丢弃中间事件。
- `simple()`：支持可选 thinkingLevel 的简化封装。

### GitHub Copilot Provider（provider/github-copilot.ts）

`GitHubCopilotStream` 实现 `ProviderStream` 接口：

- SSE 流解析 + token 统计（含缓存和推理 token）
- 消息格式转换：内部统一格式 <-> OpenAI Chat Completions JSON
- 支持系统提示、图片（base64）、工具定义
- 将 `thinkingLevel` 映射为 `reasoning_effort`
- 动态请求头（X-Initiator, Copilot-Vision-Request）

### GitHub Copilot OAuth（oauth/github-copilot.ts）

`GitHubCopilotOAuthProvider` 实现 Device Code Flow：

- 申请 device code -> 展示验证 URL + 用户码 -> 轮询 token
- 支持 GitHub Enterprise 域名配置
- 指数退避轮询 + AbortSignal 支持

### 费用计算（cost.ts）

`calculate(model, usage)` 根据每百万 token 定价计算费用明细。`CostTracker` 跨请求累计费用统计。

## 实现流程

```
调用方 --> stream(model, provider, context)
              |
       ProviderRegistry.get(model.api)  --> ProviderStream
              |
       provider.converse(model, context, options, signal)
              |
       SSE/WebSocket 响应 --> StreamEvent 序列
              |
       EventStream<StreamEvent, AssistantMessage>
              |
       消费方 for-await-of 接收事件
              |
       stream 结束 --> AssistantMessage (含 usage / stopReason)
```

认证流程：

```
AuthStore.getCredentialKey(provider)
       |
  缓存命中? --> 返回 token
       |
  环境变量? --> 返回 API Key
       |
  OAuth 凭证? --> 检查过期 --> 自动刷新 --> 返回 access token
       |
  均无 --> 抛出 ProviderError
```

## 模块分层

| 文件                             | 职责                                                         |
| -------------------------------- | ------------------------------------------------------------ |
| `src/types.ts`                   | 核心类型（Model / Message / StreamEvent / Provider / OAuth） |
| `src/model-registry.ts`          | 模型注册与解析                                               |
| `src/model-slot-resolver.ts`     | 工作流插槽到模型的映射                                       |
| `src/provider-registry.ts`       | Provider 工厂管理                                            |
| `src/auth-store.ts`              | 统一认证存储（API Key + OAuth）                              |
| `src/oauth-registry.ts`          | OAuth Provider 管理                                          |
| `src/event-stream.ts`            | 自定义 AsyncIterable 流                                      |
| `src/stream.ts`                  | 流式调用封装（stream / complete / simple）                   |
| `src/cost.ts`                    | 费用计算与追踪                                               |
| `src/provider/github-copilot.ts` | GitHub Copilot Provider 实现                                 |
| `src/oauth/github-copilot.ts`    | GitHub Copilot OAuth Device Flow                             |
| `src/models/index.ts`            | 模型定义入口                                                 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/setting`、`@vitamin/env`、`@vitamin/shared`
- **外部依赖**：`eventsource-parser`、`zod`

## 测试策略

- 测试文件数：13
- 覆盖：API Key 解析、费用计算、事件流、回退链、OAuth 流、模型注册、Provider 注册、流式调用、Token 计数等。
