# @vitamin/session

泛型会话存储 — 消息追加、上下文压缩、上下文重建。

## 核心设计

`Session<T>` 是泛型接口，不依赖任何 Agent/AI 具体类型。上层 `@vitamin/coding` 的 `AgentSession` 将其实例化为 `Session<AgentMessage>` 使用。

Session 内部维护 `SessionEntry<T>` 有序列表，每个条目是「普通消息」或「压缩摘要」：

```
[message] [message] [message] [compaction] [message] [message]
                                    ↑
                             压缩边界：buildContext() 只返回
                             此摘要 + 此后的消息
```

## Installation

```bash
pnpm add @vitamin/session
```

## Usage

```typescript
import { InMemorySession, createInMemorySessionStore } from '@vitamin/session'

// 单独使用 Session
const session = new InMemorySession<MyMessage>('session-1')

session.append({ role: 'user', text: 'Hello' })
session.append({ role: 'assistant', text: 'Hi!' })

// 获取所有消息
const messages = session.messages() // [{ role: 'user', ... }, { role: 'assistant', ... }]

// 压缩前 N 条消息为摘要
session.compact('User greeted, assistant responded.', 2)

// 构建 LLM 上下文
const ctx = session.buildContext()
// ctx.summary → 'User greeted, assistant responded.'
// ctx.messages → [] (压缩边界之后暂无新消息)
```

使用 `SessionStore` 管理多个 Session：

```typescript
const store = createInMemorySessionStore<MyMessage>()

const s1 = store.createSession('user-alice')
const s2 = store.createSession('user-bob')

s1.append({ role: 'user', text: 'Hello from Alice' })
s2.append({ role: 'user', text: 'Hello from Bob' })

const list = store.listSessions() // [s1, s2]
const found = store.getSession('user-alice') // s1
```

## 核心类型

### `SessionEntry<T>`

```typescript
type SessionEntry<T = unknown> =
  | { type: 'message'; message: T; timestamp: number }
  | { type: 'compaction'; summary: string; compactedCount: number; timestamp: number }
```

### `SessionContext<T>`

`buildContext()` 的返回值：

```typescript
interface SessionContext<T = unknown> {
  summary?: string   // 最近一次压缩的摘要（如果有）
  messages: T[]      // 压缩边界之后的消息
}
```

### `Session<T>`

```typescript
interface Session<T = unknown> {
  id: string
  append(message: T): void
  compact(summary: string, compactedCount: number): void
  entries(): ReadonlyArray<SessionEntry<T>>
  buildContext(): SessionContext<T>
  messages(): ReadonlyArray<T>
}
```

### `SessionStore<T>`

```typescript
interface SessionStore<T = unknown> {
  createSession(id?: string): Session<T>
  getSession(id: string): Session<T> | undefined
  listSessions(): ReadonlyArray<Session<T>>
}
```

## Exports

| Export | Description |
|--------|-------------|
| `InMemorySession` | 基于内存的 `Session<T>` 实现 |
| `InMemorySessionStore`, `createInMemorySessionStore` | 基于内存的 `SessionStore<T>` 实现 |

### Types

| Type | Description |
|------|-------------|
| `Session<T>` | 会话接口 |
| `SessionContext<T>` | 上下文构建结果 |
| `SessionEntry<T>` | 会话条目（消息 \| 压缩） |
| `SessionStore<T>` | 会话存储接口 |

## 与上层集成

`@vitamin/coding` 的 `AgentSession` 作为协调器，使用 `Session<AgentMessage>`：

```typescript
// AgentSession.prompt() 内部流程
session.append(userMessage)                    // 1. 追加用户消息
const ctx = session.buildContext()             // 2. 构建上下文
const result = await agent.run({              // 3. 运行 Agent
  messages: ctx.messages,
  ...
})
// 4. 新产生的 assistant/tool 消息追加回 session
for (const newMsg of newMessages) {
  session.append(newMsg)
}
```

## License

See [root README](../../README.md) for details.

### Phase 5: 会话列表与管理

1. 实现 `static list()` / `static listAll()` 会话扫描（委托 storage.list / storage.listAll）
2. 实现 session info（名称）管理
3. 实现 `forkFrom()` 跨项目 fork
4. 性能测试覆盖大量 session 文件场景

## 安装

```bash
pnpm add @vitamin/session
```

## 基本用法

```ts
import { SessionManager, createSessionStorage } from '@vitamin/session'

// ── 本地持久化（默认，目录从 env 解析） ──
const sm = SessionManager.create('/my/project')

// 显式指定 storage
const localStorage = createSessionStorage({ type: 'local', sessionDir: '/custom/path' })
const sm2 = SessionManager.create('/my/project', localStorage)

// ── 远程持久化 ──
const remoteStorage = createSessionStorage({
  type: 'remote',
  remoteUrl: 'https://api.vitamin.dev/v1',
  getAuth: async () => ({ token: 'my-token' }),
})
const sm3 = SessionManager.create('/my/project', remoteStorage)

// ── 自动选择（env 驱动） ──
// 设置 VITAMIN_SESSION_REMOTE_URL 环境变量时自动使用 RemoteStorage
const auto = createSessionStorage() // 按 env 自动决定

// ── 追加消息 ──
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Hello' }], timestamp: Date.now() })
sm.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Hi!' }], /* ... */ })

// 重建 LLM 上下文
const ctx = sm.buildSessionContext()
console.log(ctx.messages) // → [UserMessage, AssistantMessage]

// 分支
sm.branch(sm.getEntries()[0].id)
sm.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Different question' }], timestamp: Date.now() })

// 纯内存模式（测试用）
const mem = SessionManager.inMemory()
```

## License

See [root README](../../README.md) for details.
