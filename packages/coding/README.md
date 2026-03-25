# @vitamin/coding

Vitamin SDK 核心入口 — 多会话 Agent 应用框架。

## 架构总览

`VitaminApp` 作为多会话容器，每个 `AgentSession` 独立运行，拥有自己的 Agent 实例和 Session 存储。

```
┌──────────────────────────────────────────────────────────────┐
│                        VitaminApp                            │
│  (config + logger + devtools + providerRegistry)             │
│                                                              │
│  ┌─ SessionStore<AgentMessage> ────────────────────────────┐ │
│  │  管理所有 Session 实例                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Active Sessions ───────────────────────────────────────┐ │
│  │  Map<id, AgentSession>                                  │ │
│  │                                                         │ │
│  │  ┌─ AgentSession A ─────┐  ┌─ AgentSession B ────────┐ │ │
│  │  │ Agent (无状态引擎)    │  │ Agent (无状态引擎)       │ │ │
│  │  │ Session<AgentMessage> │  │ Session<AgentMessage>    │ │ │
│  │  │ model / systemPrompt  │  │ model / systemPrompt     │ │ │
│  │  │ tools / thinkingLevel │  │ tools / thinkingLevel    │ │ │
│  │  └──────────────────────┘  └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 数据流

```
AgentSession.prompt(text)
  │
  ├─ 1. session.append(userMessage)           ← 持久化用户消息
  ├─ 2. session.buildContext()                 ← 获取 summary + messages
  ├─ 3. agent.run({ model, systemPrompt,      ← Agent 无状态执行
  │        tools, messages })
  ├─ 4. workLoop 就地修改 messages 数组         ← stream → tool calls → stream …
  └─ 5. 新消息 → session.append(...)           ← 持久化回 Session
```

## Installation

```bash
pnpm add @vitamin/coding
```

## Quick Start

```typescript
import { createVitamin } from '@vitamin/coding'

const vitamin = createVitamin({
  port: 3000,
  inspect: true,
  logger: { name: 'vitamin-app', level: 'info', destination: 'app.log' },
  model: {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    api: 'anthropic',
    contextWindow: 200_000,
  },
  systemPrompt: 'You are a helpful coding assistant.',
})

await vitamin.start()

// 创建多个独立会话
const sessionA = await vitamin.createSession({ id: 'user-alice' })
const sessionB = await vitamin.createSession({ id: 'user-bob' })

// 每个会话独立运行
await sessionA.prompt('What files are in src/?')
await sessionB.prompt('Explain the project structure')
```

## Core Concepts

### VitaminApp

应用级容器，管理共享资源和多个会话的生命周期。

```typescript
const vitamin = createVitamin(options)

await vitamin.start()                         // 启动（加载配置、启动 devtools）

const session = await vitamin.createSession() // 创建会话
const found = vitamin.getSession('id')        // 检索会话
const list = vitamin.listSessions()           // 列举会话
vitamin.removeSession('id')                   // 移除会话

await vitamin.stop()                          // 停止（销毁所有会话）
```

### AgentSession

单个会话的协调器。持有 `Agent`（无状态引擎）、`Session<AgentMessage>`（消息存储）、运行时配置（model / systemPrompt / tools）。

```typescript
// 发送提示
await session.prompt('Hello')

// Steering — 在 Agent 工具调用间隙注入
session.steer('Also check for type errors')

// FollowUp — 在 Agent 完成后追加
session.followUp('Now summarize the results')

// 监听 Agent 事件（stream、tool_call 等）
const unsub = session.onAgentEvent((event) => {
  if (event.type === 'stream_event') {
    process.stdout.write(event.event.type)
  }
})

// 监听 Session 事件（prompt_start/end、message_persisted 等）
session.onSessionEvent((event) => {
  console.log(event.type, event.sessionId)
})

// 中止 / 销毁
session.abort()
session.dispose()
```

### 消息排队模型

```
用户消息 ──────────────────┐
                            ↓
                     ┌──────────────┐
                     │  AgentSession │
                     └──────┬───────┘
                            ↓
                 ┌────────────────────┐
          ┌──────│   Agent WorkLoop   │──────┐
          │      └────────────────────┘      │
          ↓               ↓                  ↓
     ┌─────────┐   ┌───────────┐    ┌──────────────┐
     │ Stream   │   │  Tools    │    │ SteeringQueue │
     │ (LLM)   │   │ Execute   │◄───│ (工具间隙注入) │
     └─────────┘   └───────────┘    └──────────────┘
          │                                  ↑
          │      ┌────────────────┐          │
          └─────►│ FollowUpQueue  │──────────┘
                 │ (完成后注入)    │
                 └────────────────┘
```

- **Steering**: 消息在 Agent 工具调用间隙被注入，适合实时纠正
- **FollowUp**: 消息在 Agent 完成当前任务后才被处理，适合追加指令

## API Reference

### `createVitamin(options)`

创建 VitaminApp 实例。

| 参数 | 类型 | 说明 |
|------|------|------|
| `port` | `number` | Devtools 端口 |
| `inspect` | `boolean` | 是否启用 Devtools |
| `logger` | `object` | 日志配置 |
| `model` | `Model` | 默认 LLM 模型 |
| `tools` | `AgentTool[]` | 默认工具集 |
| `systemPrompt` | `string` | 默认系统提示词 |
| `sessionStore` | `SessionStore<AgentMessage>` | 消息存储实现（默认 InMemorySessionStore） |
| `providerRegistry` | `ProviderRegistry` | LLM Provider 注册表 |

### `VitaminApp`

| 方法 | 返回 | 说明 |
|------|------|------|
| `start()` | `Promise<void>` | 启动应用 |
| `stop()` | `Promise<void>` | 停止应用（销毁所有会话） |
| `createSession(options?)` | `Promise<AgentSession>` | 创建新会话 |
| `getSession(id)` | `AgentSession \| undefined` | 通过 ID 检索 |
| `listSessions()` | `AgentSessionInfo[]` | 列举所有活跃会话 |
| `removeSession(id)` | `boolean` | 移除并销毁会话 |

### `AgentSession`

| 属性/方法 | 返回 | 说明 |
|-----------|------|------|
| `id` | `string` | 会话 ID |
| `session` | `Session<AgentMessage>` | 底层消息存储 |
| `status` | `string` | Agent 当前状态 |
| `prompt(text, options?)` | `Promise<void>` | 发送提示 |
| `steer(text)` | `void` | Steering 注入 |
| `followUp(text)` | `void` | FollowUp 注入 |
| `onAgentEvent(listener)` | `() => void` | 监听 Agent 事件 |
| `onSessionEvent(listener)` | `() => void` | 监听 Session 事件 |
| `abort()` | `void` | 中止当前操作 |
| `dispose()` | `void` | 销毁会话 |

### `AgentSessionOptions`

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 会话 ID（默认 UUID） |
| `model` | `Model` | 覆盖默认模型 |
| `systemPrompt` | `string` | 覆盖默认提示词 |
| `tools` | `AgentTool[]` | 覆盖默认工具 |
| `thinkingLevel` | `ThinkingLevel` | 思维级别 |
| `cwd` | `string` | 工作目录 |
| `providerRegistry` | `ProviderRegistry` | 覆盖默认 Provider 注册表 |

## Exports

```typescript
// 工厂
export { createVitamin } from '@vitamin/coding'

// 类型
export type {
  SystemContext,
  AgentSession,
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionEventType,
  PromptOptions,
} from '@vitamin/coding'
```

## License

See [root README](../../README.md) for details.
