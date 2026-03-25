# @vitamin/coding

Vitamin SDK 核心入口 — 多会话 Agent 应用框架。

## 设计决策：VitaminApp 管理多个 Session

采用 **一个 VitaminApp 管理多个 AgentSession** 的架构。

#### Pi-mono 的会话模型

Pi-mono 的核心是 `createAgentSession()` 工厂函数，创建单个 `AgentSession`：

```typescript
// pi-mono: 一个 AgentSession 同一时刻只有一个活跃会话
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
})
await session.prompt("Hello")

// 切换会话（串行，同一时刻仅一个活跃）
await session.switchSession("/path/to/other.jsonl")
await session.newSession()
```

Pi-mono 的 `AgentSession` 支持 `switchSession()` / `newSession()` / `fork()`，但**同一时刻只有一个活跃会话**。这适合单用户 CLI 场景。

#### OpenClaw 的多会话模型

OpenClaw（基于 pi-mono SDK 的真实产品）采用 **Gateway 管理多个隔离会话**：

- 每个渠道/用户/群组映射到独立 session
- `sessions_list` / `sessions_history` / `sessions_send` 工具实现跨会话通信
- 主会话（main）与群组/渠道会话隔离

#### Vitamin 的选择

Vitamin 作为可编程 AI Agent SDK，需要支持更灵活的场景：

| 场景 | 需要多会话？ |
|------|:---:|
| Web 应用为每个用户创建独立对话 | ✅ |
| 子 Agent 编排（Orchestrator 12个内置 Agent） | ✅ |
| 多窗口/多标签页并行对话 | ✅ |
| 后台任务 + 前台交互并行 | ✅ |
| A/B 对话对比 | ✅ |

因此采用：**VitaminApp 作为多会话容器，每个 AgentSession 独立运行**。

### 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                        VitaminApp                            │
│  (config + logger + devtools + providerRegistry)             │
│                                                              │
│  ┌─ SessionStore ──────────────────────────────────────────┐ │
│  │  Map<id, Session> — 消息持久化层                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Active Sessions ───────────────────────────────────────┐ │
│  │  Map<id, AgentSession>                                  │ │
│  │                                                         │ │
│  │  ┌─ AgentSession A ─────┐  ┌─ AgentSession B ────────┐ │ │
│  │  │ Agent (状态机)        │  │ Agent (状态机)           │ │ │
│  │  │  ├─ WorkLoop         │  │  ├─ WorkLoop             │ │ │
│  │  │  ├─ ToolExecutor     │  │  ├─ ToolExecutor         │ │ │
│  │  │  ├─ SteeringQueue    │  │  ├─ SteeringQueue        │ │ │
│  │  │  └─ FollowUpQueue    │  │  └─ FollowUpQueue        │ │ │
│  │  │ Session (消息历史)    │  │ Session (消息历史)       │ │ │
│  │  │ Events (事件流)       │  │ Events (事件流)          │ │ │
│  │  └──────────────────────┘  └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 与 Pi-mono 的对照

| 概念 | Pi-mono | Vitamin |
|------|---------|---------|
| 应用容器 | CLI / InteractiveMode | **VitaminApp** |
| 会话工厂 | `createAgentSession()` | `vitaminApp.createSession()` |
| 会话控制器 | `AgentSession`（单活跃） | **AgentSession**（多并发） |
| Agent 核心 | `Agent`（@pi-agent-core） | `Agent`（@vitamin/agent） |
| 消息存储 | `SessionManager`（JSONL 树） | `Session` + `SessionStore` |
| 会话切换 | `switchSession()` / `newSession()` | 通过 `getSession(id)` 随时访问任意会话 |
| 事件系统 | `subscribe()` → `AgentSessionEvent` | `onAgentEvent()` + `onSessionEvent()` |
| Steering | `steer()` 在工具间隙注入 | `steer()` 同语义 |
| FollowUp | `followUp()` 在 Agent 完成后注入 | `followUp()` 同语义 |
| 生命周期 | `dispose()` | `dispose()` |

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

await vitamin.start()                     // 启动（加载配置、启动 devtools）

const session = await vitamin.createSession()  // 创建会话
const found = vitamin.getSession('id')         // 检索会话
const list = vitamin.listSessions()            // 列举会话
vitamin.removeSession('id')                    // 移除会话

await vitamin.stop()                       // 停止（销毁所有会话）
```

### AgentSession

单个会话的控制器，拥有独立的 Agent 和 Session。

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

### 消息排队模型（源自 Pi-mono）

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
| `sessionStore` | `SessionStore` | 消息存储实现（默认 InMemory） |
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

| 方法 | 返回 | 说明 |
|------|------|------|
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

## Exports

```typescript
// 工厂
export { createVitamin } from '@vitamin/coding'

// AgentSession 实现
export { AgentSessionImpl } from '@vitamin/coding'

// 类型
export type {
  SystemContext,
  AgentSession,
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventListener,
  PromptOptions,
} from '@vitamin/coding'
```

## License

See [root README](../../README.md) for details.
