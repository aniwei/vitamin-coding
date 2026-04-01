# @vitamin/session

通用会话模块，提供：

- 基于树结构的消息会话（支持分支）
- 会话上下文构建（含摘要边界）
- 内存存储 + 本地/远程持久化
- 会话管理能力（活跃会话、过滤、分页、fork、惰性回收）

技术实现细节见 [DESIGN.md](./DESIGN.md)。

## 安装

```bash
pnpm add @vitamin/session
```

## 1. 快速接入

### 1.1 纯内存模式（开发/测试）

```ts
import { createInMemorySessionManager } from '@vitamin/session'

const manager = createInMemorySessionManager<string>()

await manager.create('chat-1', 'Debug Chat')
manager.appendMessage('hello')
manager.appendMessage('world')

const ctx = manager.buildSessionContext()
// ctx => { summary?: string, messages: ['hello', 'world'] }
```

### 1.2 本地文件持久化（推荐）

```ts
import { createDiskSessionManager } from '@vitamin/session'

const manager = createDiskSessionManager<string>('./.vitamin/sessions')

await manager.create('chat-1', 'My Session')
manager.appendMessage('first message')
await manager.save('chat-1')

// 进程重启后
const another = createDiskSessionManager<string>('./.vitamin/sessions')
await another.restoreAll()
console.log(another.get('chat-1')?.messages())
```

### 1.3 远程持久化（手动装配）

```ts
import {
  SessionManager,
  createInMemorySessionStore,
  createSessionStorage,
} from '@vitamin/session'

const persistence = createSessionStorage<string>({
  type: 'remote',
  baseUrl: 'https://api.example.com/sessions',
  fetch,
  getAuth: async () => ({ token: process.env.API_TOKEN ?? '' }),
  getHeaders: async () => ({ 'X-Tenant-Id': 'demo' }),
  timeoutMs: 30_000,
})

const manager = new SessionManager<string>({
  store: createInMemorySessionStore<string>(),
  persistence,
})
```

## 2. 会话操作

### 2.1 活跃会话

`SessionManager` 的快捷 API 都基于当前活跃会话：

- `appendMessage`
- `buildSessionContext`
- `getEntries`
- `branchAt`

```ts
await manager.create('chat-1') // 自动成为 active
manager.appendMessage('A')

await manager.create('chat-2') // active 切换到 chat-2
manager.appendMessage('B')

manager.setActive('chat-1')
console.log(manager.buildSessionContext().messages) // ['A']
```

### 2.2 分支

```ts
await manager.create('branch-demo')
manager.appendMessage('root')
manager.appendMessage('left')

const rootId = manager.getEntries()[0]?.id
if (!rootId) {
  throw new Error('root entry not found')
}

manager.branchAt(rootId)
manager.appendMessage('right')

console.log(manager.buildSessionContext().messages)
// ['root', 'right']
```

### 2.3 摘要边界（compaction）

如果你直接使用 `InMemorySession`：

```ts
import { InMemorySession } from '@vitamin/session'

const session = new InMemorySession<string>('s1')
session.append('m1')
session.append('m2')
session.compact('summary of m1,m2', 2)
session.append('m3')

console.log(session.buildContext())
// { summary: 'summary of m1,m2', messages: ['m3'] }
```

## 3. 持久化 API

```ts
await manager.save('chat-1')
await manager.saveAll()

await manager.restore('chat-1')
const restoredCount = await manager.restoreAll()
```

约定：

- 未配置 persistence 时：
  - `save/saveAll` 为 no-op
  - `restore` 返回 `null`
  - `restoreAll` 返回 `0`
- `restore/restoreAll` 遇到同 id 已存在会话时，会用持久化快照重建并覆盖该 id 对应的会话对象；恢复前请先 `save` 以避免内存未持久化改动被替换。

## 4. 列表、过滤、分页

```ts
const listPage = manager.listPaginated({
  page: 0,
  pageSize: 20,
  sortBy: 'lastActiveAt',
  order: 'desc',
})

const filteredPage = manager.filterPaginated(
  {
    tags: ['important'],
    hasParent: true,
    titleContains: 'debug',
  },
  { page: 0, pageSize: 10 },
)
```

过滤条件支持：

- `tags`（会话需包含全部标签）
- `createdAfter`
- `createdBefore`
- `hasParent`
- `titleContains`

## 5. 容量治理与惰性回收

可配置项：

- `maxSessions`：最大会话数（默认来自 `@vitamin/env`）
- `idleTimeoutMs`：空闲判定阈值（默认 30 分钟）
- `threshold`：超过该阈值时才触发惰性回收

```ts
const manager = createInMemorySessionManager<string>({
  maxSessions: 100,
  idleTimeoutMs: 30 * 60 * 1000,
  threshold: 80,
})

const removedIds = manager.collectIdle() // 手动回收
```

说明：模块不会启动后台定时器，回收只在 `create/fork/restore/restoreAll` 等关键路径按需触发。
对于自定义异步 `SessionStore`，`collectIdle()` 返回的 `removedIds` 仅表示已发起删除，不保证删除已完成或成功。

## 6. 低层适配器

### 6.1 本地适配器

```ts
import { createFileSessionPersistence } from '@vitamin/session'

const persistence = createFileSessionPersistence<string>({
  baseDir: './.vitamin/sessions',
})
```

### 6.2 远程适配器

```ts
import { RemoteSessionPersistence } from '@vitamin/session'

const persistence = new RemoteSessionPersistence<string>({
  baseUrl: 'https://api.example.com/sessions',
  fetch,
  getAuth: async () => ({ token: 'xxx' }),
  timeoutMs: 30_000,
})
```

## 7. 导出总览

- 会话模型：`InMemorySession`
- Store：`InMemorySessionStore`、`createInMemorySessionStore`
- 本地持久化：`FileSessionPersistence`、`createFileSessionPersistence`
- 兼容别名：`DiskSessionPersistence`、`createDiskSessionPersistence`
- 远程持久化：`RemoteSessionPersistence`、`RemotePersistenceError`
- 低层 HTTP：`HttpSessionPersistence`
- 管理器：`SessionManager`、`createInMemorySessionManager`、`createDiskSessionManager`、`createRemoteSessionManager`
- 存储工厂：`createSessionStorage`

## 8. 注意事项

- `createRemoteSessionManager(endpoint)` 使用的是占位 `fetch/getAuth`，仅适合先在内存模式下运行；要进行真实远程存取，请使用自定义 `SessionManager + createSessionStorage` 装配。
- `fork` 在 `InMemorySessionStore` 下会复制完整分支树；在自定义 store 下会退化为复制当前上下文消息。

## License

See [root README](../../README.md) for details.
