# @vitamin/session 设计说明

## 设计目标

- 管理 Agent 会话的完整生命周期：创建、分支、压缩、分页、持久化、回收。
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

| 文件 | 职责 |
|------|------|
| `src/types.ts` | Session / SessionEntry / SessionPersistence 等接口 |
| `src/session.ts` | InMemorySession 链表分支实现 |
| `src/session-store.ts` | SessionStore 接口 + InMemorySessionStore |
| `src/session-manager.ts` | SessionManager 容器（懒 GC + 容量控制） |
| `src/persistence/file-session-persistence.ts` | 文件持久化适配 |
| `src/persistence/http-session-persistence.ts` | HTTP 持久化适配 |
| `src/persistence/remote-session-persistence.ts` | 远程持久化适配 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/persistence`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：6
- 覆盖：会话 CRUD、分支、压缩、持久化适配、管理器 GC、分页
