# @vitamin/ai 设计说明

## 设计目标

- 提供模型抽象、Provider 适配、流事件处理与 Token 统计等 AI 基础能力。
- 通过 Provider Registry + Model Registry 实现多厂商模型的统一接入。
- 支持 OAuth 认证流（GitHub Copilot Device Flow）和 API Key 双模式。
- 将 `AssistantMessage`、`ToolCall`、`ToolResult` 等核心消息类型标准化，使上层代码（`@vitamin/agent`）与具体 Provider 解耦。
- 提供工作流插槽（WorkflowSlot）机制，允许不同任务（普通/思考/压缩）使用不同模型。

## 非目标

- 不实现具体的 Agent 执行循环（由 `@vitamin/agent` 承担）。
- 不直接管理会话状态。

## 实现原理

### 消息类型系统（types.ts）

消息分为两个层次：

1. **LLM 层消息**（`Message`）：发送给 Provider 的原始格式，包含 `UserMessage` / `AssistantMessage` / `SystemMessage` / `ToolResultMessage`。`AssistantMessage` 包含 `content`（文本块/工具调用块）、`usage`（input/output/cacheRead token）、`stopReason`（`end_turn` / `tool_use` / `max_tokens` 等）。
2. **工具定义**（`ToolDefinition`）：含 `name`、`description`、`inputSchema`（JSON Schema）和可选 `readonly` 标记。

### 模型注册表（model-registry.ts）

`ModelRegistry` 管理模型定义的注册、查询和解析：

- `register(model)` / `registerMany(models)`：注册单个/批量模型。
- `resolve(spec)` / `tryResolve(spec)`：按 `ModelSpec`（字符串 ID 或 `{provider, id}` 对象）解析到完整 `Model`，失败时 `resolve` 抛出而 `tryResolve` 返回 `undefined`。
- `createDefaultModelRegistry()`：加载内置 Copilot + Anthropic 模型数据集（JSON 文件）。
- `ModelSpec` 支持通配符匹配（如 `github-copilot/*`）用于回退链。

### Provider 注册表（provider-registry.ts）

`ProviderRegistry` 管理 Provider 工厂函数的注册与懒加载实例化：

- `register(api, factory)`：注册工厂，实例按需创建并缓存。
- `get(api)`：获取或创建 Provider 实例；第一次调用时工厂被调用，实例缓存后复用。
- `resolveAccessKey(model)` / `hasCredential(model)`：委托给 `AuthStore` 检查认证状态。
- `stream(model, context, signal)`：核心调用入口，查找 Provider 并委托 `converse()`。
- `createDefaultProviderRegistry()`：预注册 `github-copilot`、`anthropic` 两个内置 Provider。

### 模型插槽解析（model-slot-resolver.ts）

`ModelSlot` 将工作流语义（`WorkflowSlot`）映射到具体模型：

```
WorkflowSlot: 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'
```

- `resolve(slot?)` 先查插槽映射，未配置则回退到 `default` 模型。
- 插槽值支持单个 `ModelSpec` 或数组（尝试顺序直到有效模型）。
- VitaminApp 中 `TIER_TO_SLOT` 将 Agent 配置的 `preferredModelTier`（fast/standard/powerful）映射为插槽。

### 认证存储（auth-store.ts）

`AuthStore` 统一管理 API Key 和 OAuth 凭证：

1. **环境变量映射**：`{ anthropic: 'ANTHROPIC_API_KEY', 'github-copilot': 'COPILOT_GITHUB_TOKEN' }` — 按 provider 名称查找对应环境变量。
2. **OAuth 凭证**：存储在 `~/.vitamin/credentials.json`（`chmod 0o600`），包含 access token + 过期时间。
3. **自动刷新**：OAuth token 过期时调用 `OAuthRegistry` 对应 Provider 的 refresh 方法。
4. `resolveAccessKey(model)` 的优先级：环境变量 > OAuth 凭证 > 返回 undefined。

### 事件流（event-stream.ts）

`EventStream<E, R>` 自定义 AsyncIterable，实现背压控制：

- 内部维护两个队列：待消费的 `events` 缓冲区 + 等待事件的 `waiters` 队列。
- `push(event)` / `complete(result)` / `fail(error)` / `abort()`：生产者 API。
- `for await (const event of stream)` 消费；`await stream.result()` 等待最终结果。
- `done` 属性标识流是否结束。

### 流式调用（stream.ts）

```
stream(context, signal?)
  --> ProviderRegistry.get(model.api).converse(model, messages, tools, ...)
  --> ProviderStream (AsyncIterable<StreamEvent>)
  --> 包装为 EventStream<StreamEvent, AssistantMessage>
  --> 返回给调用方
```

`StreamEvent` 类型：`start`（携带 partial message）/ `chunk`（文本 delta）/ `thinking_chunk` / `tool_use` / `done`（最终消息）/ `error`。

### GitHub Copilot Provider（provider/github-copilot.ts）

实现 `ProviderStream` 接口，通过 SSE 与 GitHub Copilot API 通信：

1. **消息格式转换**：内部 `Message[]` → OpenAI Chat Completions 格式（`{role, content}`），工具定义转为 `functions` 字段。
2. **thinkingLevel 映射**：`'low'` → `reasoning_effort: 'low'`，`'high'` → `'high'`，传递给 API。
3. **流解析**：逐行解析 SSE `data:` 行，累积 delta 构建最终 `AssistantMessage`。
4. **Token 统计**：从 `usage` 字段解析 `inputTokens`、`outputTokens`、`cacheReadTokens`。
5. **错误映射**：HTTP 4xx/5xx → `ProviderError`，`context_length_exceeded` → `PromptTooLongError`。

### Anthropic Provider（provider/anthropic.ts）

使用官方 `@anthropic-ai/sdk`：

1. 调用 `client.messages.stream()` 并逐块转换为统一 `StreamEvent`。
2. thinking token 通过 `thinkingLevel` 映射为 `budget_tokens`（low=1024, medium=50%×maxOutput, high=maxOutput）。
3. 扩展错误处理：HTTP 400 + `prompt too long` 模式匹配 → `PromptTooLongError`。

## 调用链路

### 正常流式调用链路

```
VitaminApp / coding
       |
  agent.run(context)
       |
  WorkLoop.runTurn()
       |
  ctx.stream(streamContext, signal)       ← StreamFunction（注入自 ProviderRegistry）
       |
  ProviderRegistry.stream(model, context, signal)
       |
  ProviderRegistry.get(model.api)         ← 懒加载 ProviderStream 实例
       |
  provider.converse(model, messages, tools, options, signal)
       |
  HTTP SSE / SDK 调用
       |
  逐事件 yield StreamEvent
       |
  EventStream push(event)
       |
  workLoop 消费 for-await-of
       |
  emitter.emit('stream_event', { event })
       |
  assistantMessage = await stream.result()
```

### 认证解析链路

```
ProviderRegistry.resolveAccessKey(model)
       |
  AuthStore.getCredentialKey(api)
       |
  1. process.env[envKeyMap[api]] --> 直接返回
  2. OAuth credentials 文件 --> 检查过期
  3. 过期 --> OAuthRegistry.get(api).refresh() --> 更新文件
  4. 均无 --> undefined（未认证）
```

## 模块分层

| 文件                             | 职责                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `src/types.ts`                   | 核心类型（Model / Message / StreamEvent / Provider / OAuth / Tool） |
| `src/model-registry.ts`          | 模型注册与解析，内置模型集加载                                      |
| `src/model-slot-resolver.ts`     | WorkflowSlot → ModelSpec 映射与回退链                               |
| `src/provider-registry.ts`       | Provider 工厂注册与懒加载实例化，stream() 入口                      |
| `src/auth-store.ts`              | 统一认证存储（API Key + OAuth），自动刷新                           |
| `src/oauth-registry.ts`          | OAuth Provider 管理                                                 |
| `src/event-stream.ts`            | 自定义 AsyncIterable 背压流                                         |
| `src/stream.ts`                  | stream / complete / simple 便捷封装                                 |
| `src/cost.ts`                    | 费用计算（按 token 定价）与跨请求累计追踪                           |
| `src/errors.ts`                  | PromptTooLongError / isPromptTooLong 工具函数                       |
| `src/provider/github-copilot.ts` | GitHub Copilot SSE 流 Provider                                      |
| `src/provider/anthropic.ts`      | Anthropic SDK Provider                                              |
| `src/oauth/github-copilot.ts`    | GitHub Copilot OAuth Device Code Flow                               |
| `src/models/index.ts`            | 内置模型数据加载与导出                                              |
| `src/data/*.json`                | Copilot / Anthropic 模型定义数据                                    |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/env`、`@vitamin/shared`
- **外部依赖**：`@anthropic-ai/sdk`、`eventsource-parser`、`zod`

## 测试策略

- 测试文件数：13
- 覆盖：API Key 解析、费用计算、事件流背压、回退链、OAuth 流程、模型注册、Provider 注册、流式调用、Token 计数等。
- 集成风格：直接构造对象并调用，不使用 mock。
