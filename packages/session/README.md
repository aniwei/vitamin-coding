# @vitamin/session

泛型会话存储 — 消息追加、树状分支、上下文压缩、持久化、远程同步。

## 核心设计

`Session<T>` 是泛型接口，不依赖任何 Agent/AI 具体类型。上层 `@vitamin/coding` 的 `AgentSession` 将其实例化为 `Session<AgentMessage>` 使用。

### 条目树

Session 内部维护 `SessionEntry<T>` 树，每个条目有唯一 `id` 和可选 `parentId`，支持分支：

```
root ─── msg-a ─── msg-b ─── msg-c        (branch A)
                       └──── msg-d ─── msg-e  (branch B)
```

`leafId` 指向当前分支的叶节点，`branchEntries()` 沿 parentId 链回溯返回当前分支路径。

### 压缩

```
[message] [message] [message] [compaction] [message] [message]
                                    ↑
                             压缩边界：buildContext() 只返回
                             此摘要 + 此后的消息
```

## 安装

```bash
pnpm add @vitamin/session
```

## 使用

### 单独使用 Session

```ts
import { InMemorySession } from '@vitamin/session'

const session = new InMemorySession<string>('session-1')
session.append('Hello')
session.append('Hi!')

const messages = session.messages() // ['Hello', 'Hi!']

// 压缩
session.compact('User greeted, assistant responded.', 2)
const ctx = session.buildContext()
// ctx.summary → 'User greeted, assistant responded.'
// ctx.messages → []
```

### SessionManager（推荐入口）

```ts
import { SessionManager } from '@vitamin/session'

// 纯内存模式（测试用）
const mgr = SessionManager.inMemory<string>()

// 本地文件持久化
const mgr2 = SessionManager.create<string>('/path/to/sessions')

const session = await mgr.create('chat-1', 'My Chat')
mgr.appendMessage('Hello')
mgr.appendMessage('World')

const ctx = mgr.buildSessionContext()
// ctx.messages → ['Hello', 'World']
```

### 分支

```ts
mgr.appendMessage('base')
mgr.appendMessage('branch-a')

const baseId = mgr.getEntries()[0].id
mgr.branchAt(baseId)
mgr.appendMessage('branch-b')

mgr.buildSessionContext().messages // ['base', 'branch-b']
```

### 持久化

```ts
import { SessionManager, createSessionStorage } from '@vitamin/session'

// 本地
const local = createSessionStorage({ type: 'local', sessionDir: '/data/sessions' })

// 远程
const remote = createSessionStorage({
  type: 'remote',
  remoteUrl: 'https://api.example.com/sessions',
  getAuth: async () => ({ token: 'xxx' }),
})

const mgr = SessionManager.create<string>('/data/sessions')
await mgr.saveAll()
const restored = await mgr.restoreAll() // 返回恢复数量
```

### 分页

```ts
const page = mgr.listPaginated({ page: 0, pageSize: 20 })
// page.items, page.total, page.hasNext, page.hasPrevious

const filtered = mgr.filterPaginated(
  { tags: ['important'] },
  { page: 0, pageSize: 10 },
)
```

### GC（空闲回收）

```ts
const mgr = SessionManager.inMemory<string>({ idleTimeoutMs: 30 * 60 * 1000 })
mgr.startGC(60_000)  // 每 60s 检查
mgr.stopGC()
mgr.collectIdle()     // 手动回收
mgr.dispose()         // 清理所有资源
```

## 核心类型

| 类型 | 说明 |
|------|------|
| `Session<T>` | 会话接口：append, compact, branch, buildContext, messages |
| `SessionEntry<T>` | 条目（message \| compaction），含 id/parentId 树链 |
| `SessionContext<T>` | buildContext() 返回值：summary + messages |
| `SessionMetadata` | 元数据：createdAt, lastActiveAt, messageCount, tags, title |
| `SessionStore<T>` | 会话容器：create, get, list, delete, fork, paginate |
| `SessionPersistence<T>` | 持久化后端接口：save, load, delete, list, listPaginated |
| `SessionSnapshot<T>` | 序列化快照（用于持久化） |
| `SessionManager<T>` | 完整管理器：store + persistence + GC + 活跃会话 |
| `PaginatedResult<T>` | 分页结果：items, total, page, hasNext, hasPrevious |

## Exports

| Export | 说明 |
|--------|------|
| `InMemorySession` | 内存 Session 实现（含树状分支） |
| `InMemorySessionStore` / `createInMemorySessionStore` | 内存 SessionStore |
| `FileSessionPersistence` / `createFileSessionPersistence` | 文件系统持久化 |
| `RemoteSessionPersistence` / `RemotePersistenceError` | 远程 HTTP 持久化 |
| `SessionManager` / `createSessionManager` | 完整管理器 |
| `createSessionStorage` | 根据选项创建 Persistence（local \| remote） |

## License

See [root README](../../README.md) for details.
