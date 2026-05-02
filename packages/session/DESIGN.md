# @vitamin/session 设计说明

## 设计目标

- 管理 Agent 会话的完整生命周期：创建、分支（Branch）、消息追加、持久化、回收。
- 提供内存内的消息树（Branch 结构），支持对话历史的分叉与合并。
- 通过 `SessionPersistence` 抽象实现会话快照的跨进程保存，支持文件系统、HTTP、内存三种后端。
- 实现会话分页（Pagination）和空闲超时（Idle Timeout）自动回收机制。

## 非目标

- 不执行 Agent 逻辑（由 `@vitamin/agent` 完成）。
- 不直接管理工具调用。

## 实现原理

### 内存会话（in-memory-session.ts）

`InMemorySession<T>` 是单个会话的运行时表示：

**消息树结构**：

- 会话内部维护 `BranchEntry<T>[]` 线性数组，每个 Entry 包含 `{ id, message, branchId, parentId }`。
- `append(message)` → 追加消息到当前分支，生成唯一 Entry ID。
- `branch(entryId)` → 从指定 Entry 创建新分支，后续追加的消息属于新分支。
- `branchEntries()` → 返回当前分支的线性历史（从根到当前 tip）。
- `buildContext()` → 将当前分支历史打包为 `SessionContext<T>` 供 Agent 消费。

**会话元数据**：`id`、`createdAt`、`updatedAt`、`sessionType`（normal/ephemeral/background）。

**空闲追踪**：`markActive()` 更新最后活跃时间；`isIdle(timeoutMs)` 判断是否超时。

### 会话存储（store.ts）

`InMemorySessionStore<T>` 管理多个 `InMemorySession` 的内存映射：

- `create(id?, metadata?)` → 创建新会话（UUID 或指定 ID）。
- `get(id)` / `getAll()` / `delete(id)` → CRUD 操作。
- `paginate(options)` → 分页返回会话列表（支持按时间排序、过滤条件）。

### 会话管理器（session-manager.ts）

`SessionManager<T>` 协调 Store 和 Persistence，提供高层会话管理：

- `active` → 当前活跃会话。
- `setActive(id)` → 激活指定会话。
- `create(config?)` → 创建并持久化新会话。
- `restore(id?)` → 从持久化存储恢复，若超出 `threshold` 则触发回收旧会话。
- `restoreAll(filter?)` → 批量恢复（如启动时加载所有历史会话）。
- `save()` → 持久化当前活跃会话快照。
- `evict()` → 按 LRU/超时策略回收过多会话。

**回收策略**：当活跃会话数 ≥ `threshold` 时，按最后活跃时间淘汰最旧的会话到 `maxSessions` 上限。

### 会话持久化（SessionPersistence 接口）

三种实现：

**FileSessionPersistence**（file-persistence.ts）：

- 基于 `@vitamin/persistence` 的 `DiskPersistence`，将会话快照序列化为 JSON 存入 `SESSION_DIR/{id}.json`。
- `save(session)` → 序列化 + 写文件。
- `load(id)` → 读文件 + 反序列化。
- `list()` → 枚举 SESSION_DIR 下所有快照文件。

**HttpSessionPersistence**（http-persistence.ts）：

- 通过 HTTP API 存取会话快照（适用于远端服务器存储）。

**InMemorySessionPersistence**（memory-persistence.ts）：

- 存于进程内 Map，用于测试或无需持久化的场景。

### 远端持久化（remote-persistence.ts）

`RemoteSessionPersistence` 封装 HTTP 存储，支持：

- Bearer token 认证。
- 可配置 base URL。
- `listPaginated(options)` → 分页加载远端历史。

### 存储工厂（storage-factory.ts）

`createSessionPersistence(options)` 按 `type: 'file' | 'http' | 'memory'` 创建对应实现，统一工厂入口。

### 会话快照格式

```typescript
interface SessionSnapshot<T> {
  version: number             // 快照格式版本（SESSION_SNAPSHOT_VERSION）
  id: string
  messages: T[]               // 序列化后的消息列表
  branchEntries: BranchEntry<T>[]
  metadata: { createdAt, updatedAt, sessionType, ... }
}
```

## 调用链路

### 新会话创建与持久化

```
CodingSessionManager.createSession(config)
       │
  rawSession = persistence.create(config)
       │
  InMemorySessionStore.create(id)
       │
  SessionManager.save(rawSession)
       │
  FileSessionPersistence.save(snapshot)
       │
  DiskPersistence.write(SESSION_DIR/{id}.json, json)
```

### 会话恢复流程

```
CodingSessionManager.restoreAll() （服务启动时）
       │
  SessionManager.restoreAll(filter)
       │
  persistence.list() → [id, ...]
       │
  for id in ids:
    persistence.load(id) → SessionSnapshot
    InMemorySessionStore.restore(snapshot) → InMemorySession
       │
  超出 maxSessions → evict(旧会话)
```

### 消息追加与分支

```
AgentSession.run()
       │
  session.append(userMessage)
       │
  workLoop 执行 ...
       │
  session.append(assistantMessage)
  session.append(toolResultMessage)
       │
  session.buildContext() → 当前分支所有消息
       │
  SessionManager.save() → 快照持久化
```

## 模块分层

| 文件                        | 职责                                            |
| --------------------------- | ----------------------------------------------- |
| `src/types.ts`              | Session / SessionEntry / SessionSnapshot 等类型 |
| `src/in-memory-session.ts`  | 单会话内存实现（消息树 + 分支）                 |
| `src/store.ts`              | 多会话内存存储 + 分页                           |
| `src/session-manager.ts`    | 高层协调器（创建/恢复/回收/持久化）             |
| `src/file-persistence.ts`   | 文件系统持久化实现                              |
| `src/http-persistence.ts`   | HTTP 远端持久化实现                             |
| `src/memory-persistence.ts` | 内存持久化（测试用）                            |
| `src/remote-persistence.ts` | 远端服务持久化（带认证）                        |
| `src/storage-factory.ts`    | 持久化工厂函数                                  |
| `src/index.ts`              | barrel 导出                                     |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/persistence`、`@vitamin/env`、`@vitamin/shared`
- **外部依赖**：无

## 测试策略

- 测试文件数：6
- 覆盖：InMemorySession 分支操作、Store 分页、SessionManager 回收策略、文件持久化读写、快照版本兼容。

- 支持链表式分支模型（parent → child 链）。
- 提供懒回收（Lazy GC）的 SessionManager 容器。

## 非目标

- 不负责消息的生成逻辑（由 `@vitamin/agent` 完成）。
- 不实现业务级编排（由 `@vitamin/orchestrator` 完成）。

## 实现原理

### 会话数据结构（session.ts）

`InMemorySession` 基于链表维护消息序列：

- `parentId` / `leafId`：分支链关系
- `entries`：消息条目数组（MessageEntry）
- `compact(keepCount)`：保留最近 N 条，压缩其余为摘要
- `fork()`：创建分支，共享历史前缀
- `addEntry()` / `getEntries()` / `getLatestEntries()`

### 会话存储（session-store.ts）

`SessionStore` 接口与 `InMemorySessionStore` 实现：

- CRUD 操作：`create()` / `get()` / `update()` / `delete()` / `list()`
- 分页支持：`list(cursor?, pageSize?)`

### 会话持久化（persistence/）

三种持久化适配器：

- `FileSessionPersistence`：基于 `@vitamin/persistence` DiskPersistence
- `HttpSessionPersistence`：基于 RemotePersistence
- `RemoteSessionPersistence`：自定义 HTTP 实现

都实现 `SessionPersistence` 接口：`save(session)` / `load(id)` / `delete(id)` / `list()`。基于 Snapshot 包装进行版本控制。

### 会话管理器（session-manager.ts）

`SessionManager` 负责会话容器管理：

- `create()` / `get()` / `delete()` / `list()`：会话 CRUD
- `fork(sessionId)`：分支创建
- **懒回收**：每次操作时检查 `idleTimeoutMs`，回收超时闲置会话
- **容量限制**：检查 `maxSessions`，超限则回收最早会话
- 事件发射：`session:created` / `session:deleted` / `session:forked`

## 实现流程

```
SessionManager
     |
  create() --> InMemorySession（新建）
     |         + SessionStore.create()
     |         + SessionPersistence.save()（如有）
     |
  get(id) --> 检查 idle 超时
     |    --> 更新 lastAccessedAt
     |    --> 返回 InMemorySession
     |
  agent.run() --> session.addEntry()
     |         --> session.compact()（消息超限时）
     |
  idle 超时 --> lazyGC() --> delete + persist
     |
  容量超限 --> evictOldest() --> delete oldest
```

## 模块分层

| 文件                                            | 职责                                               |
| ----------------------------------------------- | -------------------------------------------------- |
| `src/types.ts`                                  | Session / SessionEntry / SessionPersistence 等接口 |
| `src/session.ts`                                | InMemorySession 链表分支实现                       |
| `src/session-store.ts`                          | SessionStore 接口 + InMemorySessionStore           |
| `src/session-manager.ts`                        | SessionManager 容器（懒 GC + 容量控制）            |
| `src/persistence/file-session-persistence.ts`   | 文件持久化适配                                     |
| `src/persistence/http-session-persistence.ts`   | HTTP 持久化适配                                    |
| `src/persistence/remote-session-persistence.ts` | 远程持久化适配                                     |
| `src/index.ts`                                  | barrel 导出                                        |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/persistence`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：6
- 覆盖：会话 CRUD、分支、压缩、持久化适配、管理器 GC、分页
