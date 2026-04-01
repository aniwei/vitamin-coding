# @vitamin/ai

统一多 Provider LLM 流式对话 API，为 vitamin-coding 生态提供底层 AI 能力。

> **参考实现**: [pi-mono/packages/ai](https://github.com/badlogic/pi-mono/tree/main/packages/ai) (`@mariozechner/pi-ai`)

---

## 目录

- [设计目标](#设计目标)
- [架构总览](#架构总览)
- [职责边界](#职责边界)
- [源码结构](#源码结构)
- [核心类型](#核心类型)
  - [Model](#model)
  - [Message](#message)
  - [StreamEvent](#streamevent)
  - [ToolDefinition](#tooldefinition)
  - [Usage & Cost](#usage--cost)
- [Provider 适配层](#provider-适配层)
  - [ProviderStream 接口](#providerstream-接口)
  - [API 注册表](#api-注册表)
  - [Provider 懒加载](#provider-懒加载)
- [流式引擎](#流式引擎)
  - [EventStream](#eventstream)
  - [stream / complete / simple](#stream--complete--simple)
- [鉴权与 API Key](#鉴权与-api-key)
  - [环境变量 Key 解析](#环境变量-key-解析)
  - [OAuth 注册表](#oauth-注册表)
- [模型注册表](#模型注册表)
- [费用精算](#费用精算)
- [与 pi-ai 的对比及差异决策](#与-pi-ai-的对比及差异决策)
- [Provider 实现指南](#provider-实现指南)
- [开发指南](#开发指南)

---

## 设计目标

| 目标 | 说明 |
|------|------|
| **协议统一** | 将 OpenAI Completions/Responses、Anthropic Messages、Google Generative AI、Bedrock ConverseStream 等异构协议归一为统一的 `StreamEvent` 流 |
| **零全局状态** | 所有注册表通过实例传递，避免模块级单例——便于测试和多会话隔离 |
| **懒加载 Provider** | 各 Provider 适配器按需 `import()`，不增加首屏加载开销 |
| **类型安全** | `Model<TApi>` 泛型确保 API 协议与 Provider 兼容性设置联动 |
| **成本可审计** | 内嵌 token 计费与 `CostTracker`，无需外部依赖即可追踪支出 |
| **最小依赖** | 核心仅依赖 `@vitamin/shared`（错误类、日志、HTTP SSE）和 `eventsource-parser` |

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        @vitamin/ai                              │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ stream() │──▶│ ProviderReg  │──▶│ Provider 适配器        │  │
│  │ complete()│   │ (按 api 索引) │   │ ┌──────────────────┐  │  │
│  │ simple() │   └──────────────┘   │ │ github-copilot   │  │  │
│  └────┬─────┘                      │ │ openai-compl.    │  │  │
│       │                            │ │ anthropic-msg.   │  │  │
│       ▼                            │ │ google-gen-ai    │  │  │
│  ┌──────────┐                      │ │ ...              │  │  │
│  │EventStream│◀── StreamEvent ────│ └──────────────────┘  │  │
│  │<E, R>    │                      └────────────────────────┘  │
│  └──────────┘                                                   │
│       │                                                         │
│       ├── for-await-of (逐事件消费)                              │
│       └── .result() (等待完整 AssistantMessage)                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ ModelRegistry │  │ OAuthRegistry│  │ CostTracker         │   │
│  │ (id → Model)  │  │ (api → OAuth)│  │ (record + byModel)  │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
        ▲                      ▲
        │                      │
   @vitamin/shared         环境变量 / OAuth 令牌
   (ProviderError,
    OAuthError,
    stream() SSE,
    createLogger)
```

---

## 职责边界

`@vitamin/ai` 的职责是 **统一模型协议、Provider 适配、流式事件、usage 归一化与费用精算**。它不负责会话持久化、上下文压缩策略或运行期 Hook 策略。

与其他包的边界约定如下：

| 包 | 职责 | 与 `@vitamin/ai` 的关系 |
|----|------|-------------------------|
| `@vitamin/shared` | 错误类型、日志、HTTP/SSE、通用事件工具 | `@vitamin/ai` 直接复用，不重复实现底层传输 |
| `@vitamin/setting` | 静态配置加载与 schema 校验 | 负责 `model`/`temperature`/`max_tokens` 等配置来源，运行时再映射到 `StreamContext` |
| `@vitamin/hooks` | 运行期参数改写、预算控制、质量策略 | 可在 `chat.params` 阶段调整 `maxTokens`/`thinkingLevel`，但不负责 Provider 协议适配 |
| `@vitamin/session` | 会话生命周期、分支、持久化 | 管理多轮消息状态，`@vitamin/ai` 只消费调用时的消息切片 |
| `@vitamin/memory` | 剪枝、压缩、归档、token 估算 | 提供上下文管理与近似 token 估算，不承担精确计费 |
| `@vitamin/agent` | 工具循环、跟进/steer、Agent 生命周期 | 建立在 `stream()` 之上消费模型输出，不重做 AI 调用层 |

### Token 相关能力分工

Token 相关能力在仓库中分散存在，但职责并不相同：

| 能力 | 所属包 | 说明 |
|------|--------|------|
| **精确 usage** | `@vitamin/ai` | 来自 Provider 返回的 `Usage`，用于账单与结果归档 |
| **费用精算** | `@vitamin/ai` | `calculate()` / `CostTracker` 基于模型费率计算美元成本 |
| **预算约束** | `@vitamin/hooks` | `createTokenBudgetHook()` 在运行期限制 `maxTokens` 并发出阈值警告 |
| **近似估算** | `@vitamin/memory` | `estimateTokens()` / `estimateContextTokens()` 用于压缩和上下文控制 |

因此，`CostTracker` 仅负责 **费用审计**，不承担上下文压缩决策，也不替代 Hook 层的 token 预算策略。

---

## 源码结构

```
packages/ai/
├── src/
│   ├── index.ts               # 公共 API barrel
│   ├── types.ts               # 核心类型: Model, Message, StreamEvent, ProviderStream, OAuth …
│   ├── event-stream.ts        # EventStream<E, R> — 双模式异步可迭代流
│   ├── stream.ts              # 编排入口: stream() / complete() / simple()
│   ├── model-registry.ts      # ModelRegistry — 模型 CRUD 注册表
│   ├── provider-registry.ts   # ProviderRegistry — Provider 工厂 + 惰性单例
│   ├── oauth-registry.ts      # OAuthRegistry — OAuth 工厂 + 惰性单例
│   ├── cost.ts                # calculate() + CostTracker
│   ├── provider/
│   │   └── github-copilot.ts  # GitHub Copilot (OpenAI Completions 兼容) 适配器
│   └── oauth/
│       └── github-copilot.ts  # GitHub Copilot OAuth 流程 (TODO)
└── tests/
    ├── event-stream.test.ts
    ├── stream.test.ts
    ├── model-registry.test.ts
    ├── provider-registry.test.ts
    ├── cost-calculator.test.ts
    └── ...
```

---

## 核心类型

> 完整定义见 `src/types.ts`。

### Model

```ts
interface Model<T = Api> {
  id: string               // e.g. "github-copilot/gpt-4.1"
  name: string             // 显示名
  api: T                   // 协议类型: "openai-completions" | "anthropic-messages" | …
  provider: Provider       // 供应商: "openai" | "github-copilot" | …
  baseUrl: string          // API 端点
  reasoning: boolean       // 是否支持思考/推理
  input: ('text'|'image')[]
  cost: Cost               // 每百万 token 费率
  contextWindow: number
  maxOutputTokens: number
  thinkingLevels?: ThinkingLevel[]
  transport?: 'sse' | 'websocket' | 'auto'
  compat?: Compat          // Provider 兼容性覆盖
}
```

**与 pi-ai 对比**:
- pi-ai `Model` 的 `compat` 类型通过条件类型 `TApi extends "openai-completions" ? OpenAICompletionsCompat : …` 做了编译期约束；vitamin 当前用统一 `Compat` 占位，后续可按需细化。
- pi-ai `Model` 有 `headers` 字段（自定义请求头），vitamin 暂未引入，可按需追加。

### Message

三种角色的联合类型：

```ts
type Message = UserMessage | AssistantMessage | ToolResultMessage

interface UserMessage {
  role: 'user'
  content: string | ContentPart[]
  timestamp: number
}

interface AssistantMessage {
  role: 'assistant'
  content: (TextContent | ThinkingContent | ToolCall)[]
  api: Api
  provider: Provider
  model: string
  usage: Usage
  stopReason: StopReason
}

interface ToolResultMessage<T = unknown> {
  role: 'tool_result'
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  details: T
  isError: boolean
  timestamp: number
}
```

**内容部分**:

| 类型 | 字段 | 说明 |
|------|------|------|
| `TextContent` | `type: 'text'`, `text`, `signature?` | 文本内容 |
| `ThinkingContent` | `type: 'thinking'`, `text`, `signature?` | 推理过程 |
| `ImageContent` | `type: 'image'`, `mime`, `source` | Base64 图像数据 |
| `ToolCall` | `type: 'tool_call'`, `id`, `name`, `arguments` | 工具调用 |

**与 pi-ai 对比**:
- pi-ai 使用 `toolCall` / `toolResult` 作为 `type` 值（camelCase），vitamin 使用 `tool_call` / `tool_result`（snake_case）
- pi-ai `ThinkingContent.thinking` 字段名，vitamin 使用 `ThinkingContent.text`——语义一致但字段不同
- pi-ai `ImageContent` 字段为 `data`（base64）+ `mimeType`；vitamin 为 `source` + `mime`
- pi-ai `AssistantMessage` 有 `errorMessage?` 和 `timestamp`；vitamin 不在 AssistantMessage 上携带错误信息，而是通过 `StreamEvent.error` 分离错误流

### StreamEvent

基于可区分联合的流式事件协议：

```ts
type StreamEvent =
  | { type: 'start';          partial: AssistantMessage }
  | { type: 'text_start';     index: number; partial: AssistantMessage }
  | { type: 'text_delta';     index: number; delta: string; partial: AssistantMessage }
  | { type: 'text_end';       index: number; content: string; partial: AssistantMessage }
  | { type: 'thinking_start'; index: number; partial: AssistantMessage }
  | { type: 'thinking_delta'; index: number; delta: string; partial: AssistantMessage }
  | { type: 'thinking_end';   index: number; content: string; partial: AssistantMessage }
  | { type: 'tool_call_start';index: number; partial: AssistantMessage }
  | { type: 'tool_call_delta';index: number; delta: string; partial: AssistantMessage }
  | { type: 'tool_call_end';  index: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: 'done';           reason: StopReason; message: AssistantMessage }
  | { type: 'error';          error: Error }
```

**设计要点**:
- 每个增量事件都附带 `partial: AssistantMessage`（累积快照），方便 UI 在任意时刻拿到完整状态
- `index` 标识内容块索引（支持并行的多个 text/thinking/toolcall 块）
- `done` 携带 `StopReason`（`end_turn` | `max_tokens` | `tool_use` | `stop_sequence`）
- `error` 变体只含 `Error`，与 pi-ai 的 "error 携带 AssistantMessage" 不同——vitamin 将错误通道与正常消息通道分离

**与 pi-ai 对比**:
- pi-ai 使用 `contentIndex` 命名；vitamin 使用 `index`
- pi-ai `done.reason` 使用 `"stop"` | `"length"` | `"toolUse"`；vitamin 使用 `"end_turn"` | `"max_tokens"` | `"tool_use"` 风格
- pi-ai `error` 事件包含 `reason: "aborted" | "error"` + `error: AssistantMessage`；vitamin 简化为仅 `error: Error`

### ToolDefinition

```ts
interface ToolDefinition<TArgs = unknown> {
  name: string
  description: string
  parameters: ZodType<TArgs>     // Zod-compatible schema
  visibility?: 'always' | 'when-enabled' | 'when-requested'
}
```

**与 pi-ai 对比**:
- pi-ai 使用 `@sinclair/typebox` 的 `TSchema`；vitamin 使用自定义 `ZodType` 接口（带 `toJSONSchema()` 方法），避免直接依赖 Zod
- vitamin 额外提供 `visibility` 控制工具暴露策略

### Usage & Cost

```ts
interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface Cost {        // 每百万 token 的美元费率
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}
```

**与 pi-ai 对比**:
- pi-ai 将 `cost` 内嵌在 `Usage` 中（`usage.cost.total` 运行时计算）；vitamin 将费率定义在 `Model.cost`，运行时通过 `calculate(model, usage)` 得到 `CostBreakdown`——关注点分离更清晰

---

## Provider 适配层

### ProviderStream 接口

每个 LLM 供应商需要实现的核心合约：

```ts
interface ProviderStream {
  readonly id: string
  readonly displayName: string

  // 解析 API Key（可选，由 OAuthRegistry 或环境变量驱动）
  resolveKey?(model: Model): Promise<string>

  // 核心方法：将统一的 Context 转成供应商 API 调用，返回 StreamEvent 异步迭代器
  converse(
    model: Model<Api>,
    context: StreamContext,
    options: StreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<StreamEvent>

  // 供应商健康检查（可选）
  healthCheck?(token: string): Promise<boolean>
}
```

**与 pi-ai 方案差异**:
- pi-ai 使用函数式 `StreamFunction`（`(model, context, options?) => AssistantMessageEventStream`），Provider 不作为对象实例
- vitamin 采用面向对象的 `ProviderStream` 接口，便于承载 `resolveKey`、`healthCheck` 等生命周期方法

### API 注册表

`ProviderRegistry` 以 `Api` 协议类型为 key，管理工厂函数和缓存实例：

```ts
const oauthRegistry = createDefaultOAuthRegistry()
const registry = createDefaultProviderRegistry({ oauthRegistry })

// 需要时可以继续注册自定义 provider
registry.register('custom-api', () => new CustomProvider())

// 获取（惰性创建 + 单例缓存）
const provider = registry.get('github-copilot')
```

**与 pi-ai 对比**:
- pi-ai 使用模块级 `Map<string, RegisteredApiProvider>` 全局单例（`registerApiProvider()` / `getApiProvider()`）
- vitamin 使用实例化的 `ProviderRegistry` 类——可在测试中独立创建、在多会话中隔离

### Provider 懒加载

基于 pi-ai 的懒加载模式，Provider 适配器应按如下方式注册：

```ts
// 注册时传入工厂函数（闭包中包含 dynamic import）
registry.register('anthropic-messages', () => {
  // 首次调用时才 import 适配器模块
  return createAnthropicProvider()
})
```

实际运行时，只有真正使用某个 API 协议时才会加载对应的 Provider 模块，避免启动时加载全部依赖。

---

## 流式引擎

### EventStream

`EventStream<E, R>` 是核心的双模式异步流：

```ts
class EventStream<E, R> implements AsyncIterable<E> {
  push(event: E): void           // 生产者推送事件
  complete(result: R): void      // 标记完成（resolve promise）
  fail(error: Error): void       // 标记失败（reject promise）
  abort(): void                  // 取消流

  result(): Promise<R>           // 等待最终结果
  [Symbol.asyncIterator]()       // for-await-of 消费
}
```

**消费模式**:

```ts
// 模式 A：逐事件消费（UI 渲染）
const eventStream = stream(model, provider, context, options)
for await (const event of eventStream) {
  if (event.type === 'text_delta') render(event.delta)
}

// 模式 B：一次性获取结果
const message = await complete(model, provider, context, options)
```

**与 pi-ai EventStream 对比**:

| 维度 | pi-ai | vitamin |
|------|-------|---------|
| 完成判定 | 构造器注入 `isComplete` / `extractResult` 回调 | 显式 `complete(result)` / `fail(error)` 调用 |
| 专用子类 | `AssistantMessageEventStream extends EventStream` | 直接使用 `EventStream<StreamEvent, AssistantMessage>` 泛型 |
| 错误传播 | `end(result)` 统一结束 | `fail(error)` 独立错误路径，reject promise 并通知迭代器 |
| 取消 | 无内置 abort | 内置 `AbortController` 关联 |

### stream / complete / simple

三个编排入口函数：

```ts
// 底层流式 API
function stream(model, provider, context, options): EventStream<StreamEvent, AssistantMessage>

// 一次性完成（await 结果）
async function complete(model, provider, context, options): Promise<AssistantMessage>

// 语法糖（thinkingLevel 可选参数隔离）
function simple(model, provider, context, options): EventStream<StreamEvent, AssistantMessage>
```

`stream()` 内部编排流程：

1. 创建 `EventStream` + `AbortController`
2. 合并外部 `signal`（`AbortSignal.any`）
3. 异步遍历 `provider.converse()` 的 `StreamEvent`
4. 将事件 push 到 EventStream
5. 遇到 `done` → `stream.complete(message)`
6. 遇到 `error` → `stream.fail(error)`
7. 遍历结束但无 `done` → fail `PROVIDER_INCOMPLETE_STREAM`

---

## 鉴权与 API Key

### 环境变量 Key 解析

基于 pi-ai `env-api-keys.ts` 模式，`@vitamin/ai` 在 Provider 层内做环境变量候选解析：

```ts
function resolveProviderEnvKey(provider: KnownProvider): string | undefined
```

环境变量映射规则：

| Provider | 环境变量 |
|----------|----------|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `google` | `GEMINI_API_KEY` |
| `github-copilot` | `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` |
| `groq` | `GROQ_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `moonshot` | `MOONSHOT_API_KEY` |

### OAuth 注册表

`OAuthRegistry` 管理需要 OAuth 授权流程的供应商（如 GitHub Copilot）：

```ts
const oauthRegistry = createDefaultOAuthRegistry()

const oauth = oauthRegistry.get('github-copilot')
const token = await oauth.resolve()  // 获取有效 access token
```

`OAuth` 接口：

```ts
interface OAuth {
  readonly id: string
  readonly displayName: string
  credentials: OAuthCredentials | undefined

  authorize(model: Model): Promise<OAuthCredentials>
  refresh(): Promise<void>
  resolve(): Promise<string>    // 获取有效 token（自动续期）
}
```

---

## 模型注册表

`ModelRegistry` 以 `model.id` 为 key 管理模型定义：

```ts
const registry = createModelRegistry()

registry.register({
  id: 'github-copilot/gpt-4.1',
  name: 'GPT-4.1',
  api: 'openai-completions',
  provider: 'github-copilot',
  baseUrl: 'https://api.githubcopilot.com',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 3, output: 12, cacheRead: 1.5, cacheWrite: 3 },
  contextWindow: 1048576,
  maxOutputTokens: 32768,
})

const model = registry.get('github-copilot/gpt-4.1')
const allOpenAI = registry.getByProvider('openai')
```

**与 pi-ai 对比**:
- pi-ai 使用自动生成的 `models.generated.ts`（351KB，包含全部已知模型定义），在模块加载时自动灌入 `Map<Provider, Map<id, Model>>`
- vitamin 暂不自动生成，而是按需注册——初期更灵活，后续可引入代码生成

---

## 费用精算

```ts
import { calculate, createCostTracker } from '@vitamin/ai'

// 单次计算
const breakdown = calculate(model, usage)
// → { input: 0.003, output: 0.012, cacheRead: 0, cacheWrite: 0, total: 0.015 }

// 跟踪器
const tracker = createCostTracker()
tracker.record(model, usage)
tracker.total       // 总费用
tracker.totalTokens // { input, output }
tracker.byModel()   // 按模型分组
```

---

## 与 pi-ai 的对比及差异决策

| 维度 | pi-ai | @vitamin/ai | 决策理由 |
|------|-------|-------------|----------|
| **Provider 模式** | 函数式 `StreamFunction` | 面向对象 `ProviderStream` 接口 | 便于承载 resolveKey、healthCheck 生命周期 |
| **注册表** | 模块级全局 `Map` | 实例化类（`new ProviderRegistry`） | 零全局状态，便于测试隔离和多会话 |
| **EventStream 完成判定** | 构造器注入回调 | 显式 `complete()` / `fail()` | 更直观，错误路径独立 |
| **错误事件** | `error: AssistantMessage`（含 `errorMessage`） | `error: Error` | 关注点分离：错误通道不混入消息结构 |
| **StopReason** | `"stop"` / `"length"` / `"toolUse"` | `"end_turn"` / `"max_tokens"` / `"tool_use"` | 更贴近 Anthropic/OpenAI 原始语义 |
| **Schema 工具** | `@sinclair/typebox` | 自定义 `ZodType` 接口（Zod 兼容） | 避免 typebox 硬依赖，Zod 在 TypeScript 生态更普及 |
| **模型数据** | 自动生成 `models.generated.ts` | 按需手动注册 | 初期灵活，后续可引入代码生成 |
| **compat** | 条件类型 `TApi extends … ? …` | 统一 `Compat` 占位 | 减少初期类型复杂度，后续按需细化 |
| **依赖** | `openai`, `@anthropic-ai/sdk`, `@google/genai`, `@sinclair/typebox` 等 | 仅 `@vitamin/shared` + `eventsource-parser` | 最小依赖策略，Provider SDK 留给具体适配器按需引入 |

---

## Provider 实现指南

### 实现新 Provider 的步骤

1. **在 `src/provider/` 下新建文件**，如 `anthropic.ts`

2. **实现 `ProviderStream` 接口**：

```ts
import type { ProviderStream, Model, StreamContext, StreamOptions, StreamEvent } from '../types'

class AnthropicStream implements ProviderStream {
  id = 'anthropic-messages'
  displayName = 'Anthropic'

  async *converse(model, context, options, signal): AsyncIterable<StreamEvent> {
    // 1. 解析 API Key
    // 2. 构建请求体（转换 Message → Anthropic 格式）
    // 3. 发起 SSE 请求
    // 4. 解析 SSE 事件，yield StreamEvent
    // 5. yield { type: 'done', reason, message }
  }
}

export function createAnthropicProvider(): ProviderStream {
  return new AnthropicStream()
}
```

3. **注册到 ProviderRegistry**：

```ts
registry.register('anthropic-messages', () => createAnthropicProvider())
```

4. **在 `index.ts` 中导出工厂函数**

5. **编写测试**：使用预录制的 SSE fixture 测试 `converse` 流

### 消息协议转换要点

| vitamin 类型 | OpenAI 格式 | Anthropic 格式 |
|------------|-------------|----------------|
| `UserMessage` | `{ role: 'user', content: … }` | `{ role: 'user', content: [{type:'text',text:…}] }` |
| `AssistantMessage` | `{ role: 'assistant', content, tool_calls }` | `{ role: 'assistant', content: [{type:'text',text:…}] }` |
| `ToolResultMessage` | `{ role: 'tool', tool_call_id, content }` | `{ role: 'user', content: [{type:'tool_result', tool_use_id, content}] }` |
| `ToolCall` | `tool_calls: [{ function: {name, arguments} }]` | `content: [{ type: 'tool_use', id, name, input }]` |

---

## 开发指南

### 构建

```bash
pnpm build          # tsup 构建 ESM + dts
pnpm typecheck      # tsc --noEmit 类型检查
```

### 测试

```bash
# 运行全部测试
pnpm vitest run packages/ai/tests/

# 运行单个测试
pnpm vitest run packages/ai/tests/stream.test.ts
```

### 代码规范

- 测试不使用 mock/spy，优先真实执行和集成式断言
- 新 Provider 需附带使用预录制 SSE fixture 的 `converse` 流测试
- 所有公共 API 通过 `src/index.ts` 统一导出
- 类型定义集中在 `src/types.ts`
