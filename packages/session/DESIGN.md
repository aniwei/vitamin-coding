# @vitamin/session DESIGN

这份文档描述 `@vitamin/session` 当前源码实现的技术设计，聚焦数据模型、核心流程、持久化契约与容量治理策略。

## 1. 设计目标

- 提供通用的会话抽象 `Session<T>`，不绑定具体消息类型。
- 支持树状分支会话（branching），让同一历史可派生多条上下文路径。
- 提供可替换的持久化适配层（本地文件/远程 HTTP）。
- 提供面向业务接入的管理器 `SessionManager<T>`：活跃会话、过滤、分页、持久化批处理、容量治理。

## 2. 非目标

- 不负责消息压缩的具体语义生成（只存储 `summary` 字段，不调用 LLM）。
- 不实现自动后台定时 GC；只在关键操作时触发惰性回收。
- 不内置网络重试/熔断策略；远程容灾由调用方或 `@vitamin/persistence` 体系承担。

## 3. 模块分层

```text
                      +--------------------------------+
                      |        SessionManager<T>       |
                      |  active/fork/filter/save/...   |
                      +---------------+----------------+
                                      |
                 +--------------------+--------------------+
                 |                                         |
       +---------v----------+                    +---------v----------+
       | SessionStore<T>    |                    | SessionPersistence | 
       | (in-memory store)  |                    | (file/remote)      |
       +---------+----------+                    +---------+----------+
                 |                                         |
       +---------v----------+                    +---------v----------+
       | InMemorySession<T> |                    | Disk/Remote adapter |
       | entry tree + branch|                    | via @vitamin/persistence |
       +--------------------+                    +---------------------+
```

对应源码：

- 会话实体：[packages/session/src/in-memory-session.ts](packages/session/src/in-memory-session.ts)
- 会话容器：[packages/session/src/store.ts](packages/session/src/store.ts)
- 管理器：[packages/session/src/session-manager.ts](packages/session/src/session-manager.ts)
- 持久化适配：[packages/session/src/file-persistence.ts](packages/session/src/file-persistence.ts)、[packages/session/src/remote-persistence.ts](packages/session/src/remote-persistence.ts)、[packages/session/src/http-persistence.ts](packages/session/src/http-persistence.ts)
- 类型契约：[packages/session/src/types.ts](packages/session/src/types.ts)

## 4. 核心数据结构

### 4.1 SessionEntry<T>

`SessionEntry<T>` 是会话树节点，包含两类：

- `message` 节点：携带业务消息 `message: T`
- `compaction` 节点：携带摘要 `summary` 和 `compactedCount`

每个节点包含 `id` 和可选 `parentId`，形成从 root 到 leaf 的有向链。

### 4.2 SessionMetadata

会话元数据包括：

- 时间：`createdAt`、`lastActiveAt`
- 计数：`messageCount`、`compactionCount`
- 关系：`parentSessionId`、`forkPoint`
- 标签和展示：`tags`、`title`

### 4.3 Snapshot

`SessionSnapshot<T>` 是持久化格式：

- `version`
- `id`
- `entries`
- `metadata`
- `leafId`

`version` 由 `SESSION_SNAPSHOT_VERSION` 控制，当前默认值为 `1`。

## 5. InMemorySession 行为设计

### 5.1 追加消息

- `append(message)` 新建 `message` 节点，`parentId` 指向当前 `leafId`。
- 更新 `leafId`、`messageCount`、`lastActiveAt`。

### 5.2 分支切换

- `branch(entryId)` 将当前叶子切换到任意已存在节点。
- 不会删除旧分支节点；`entries()` 返回全量节点，`branchEntries()` 返回当前分支路径。

### 5.3 压缩边界

- `compact(summary, compactedCount)` 仅在当前分支“未被摘要覆盖的 message 数量”足够时写入 `compaction` 节点。
- `buildContext()` 只取当前分支最新一个 `compaction` 之后的 message，并附带该 `summary`。
- 若当前分支不存在 `compaction`，`buildContext()` 返回全量分支消息。

### 5.4 快照恢复

- `toSnapshot()` 导出完整快照。
- `restoreEntries(entries, metadata, leafId?)` 重建条目图和元数据。
- 未传 `leafId` 时，回退到 `entries` 最后一项。

## 6. SessionStore 设计

默认实现 `InMemorySessionStore<T>` 使用 `Map<string, InMemorySession<T>>` 承载会话。

提供能力：

- `createSession/getSession/listSessions/deleteSession`
- `listSessionsPaginated(options)`：支持 `sortBy(createdAt|lastActiveAt)` 与 `order(asc|desc)`
- 默认分页大小 `50`
- 扩展方法 `forkSession(sourceId, newId?)`（不在通用接口中），用于高保真 fork（复制完整 entries、leafId、metadata）

## 7. 持久化适配层

### 7.1 本地文件

`FileSessionPersistence<T>` 继承 `DiskPersistence<SessionSnapshot<T>>`：

- 文件后缀：`.session.json`
- 默认分页大小：`SESSION_PAGE_SIZE`（来自 `@vitamin/env`）

兼容别名：

- `DiskSessionPersistence`
- `createDiskSessionPersistence`

### 7.2 远程持久化

`RemoteSessionPersistence<T>` 继承 `RemotePersistence<SessionSnapshot<T>>`：

- 默认排序字段：`lastActiveAt`
- 默认分页大小：`SESSION_PAGE_SIZE`
- 错误类型：`RemotePersistenceError`

### 7.3 低层 HTTP 包装

`HttpSessionPersistence<T>` 继承 `HttpPersistence<SessionSnapshot<T>>`，主要用于对接低层 HTTP 语义，不直接实现 `SessionPersistence<T>`。

### 7.4 storage 工厂

`createSessionStorage(options)` 支持类型别名：

- 本地：`local` / `file`（要求 `baseDir`）
- 远程：`remote` / `http`（要求 `baseUrl`、`getAuth`、`fetch`，可选 `getHeaders`、`timeoutMs`）

## 8. SessionManager 运行时流程

### 8.1 活跃会话模型

- `activeSessionId` 指向当前活跃会话。
- `appendMessage/buildSessionContext/getEntries/branchAt` 只作用于活跃会话。
- 若无活跃会话，以上方法抛错。

### 8.2 创建/删除/切换

- `create(id?, title?)` 创建并自动设为活跃。
- 若底层为 `InMemorySession` 且提供 `title`，会写入 metadata。
- `delete(id)` 同时删除 store 与 persistence（若存在），并清理活跃引用。

### 8.3 过滤与分页

- `filter(criteria)` 支持：`tags`（包含全部）、`createdAfter`、`createdBefore`、`hasParent`、`titleContains`。
- `filterPaginated(criteria, options)` 在过滤后排序分页。
- `listPaginated(options)` 直接委托 store。

### 8.4 fork 语义

- 若 store 为 `InMemorySessionStore`，走 `forkSession`，复制完整树与元数据（含 `parentSessionId`、`forkPoint`、`tags + fork`）。
- 否则走 `genericFork`：仅复制 `buildContext().messages`，不会复制旧分支结构与历史 compaction 节点。

### 8.5 持久化 I/O

- `save(id)`：仅对 `InMemorySession` 导出 snapshot 并写入 persistence。
- `restore(id)`：按快照恢复单个会话。
- `saveAll()`：遍历全部会话逐个保存。
- `restoreAll()`：从 persistence 列表逐个恢复，若容量不足提前停止，返回“实际新增恢复数”。
- 若 store 中已存在同 id，会以快照重建并覆盖该 id 对应的会话对象引用（快照优先）。

## 9. 容量治理与惰性回收

### 9.1 配置项

- `maxSessions`：最大会话数（默认 `SESSION_MAX`，当前默认值 50）
- `idleTimeoutMs`：空闲判定阈值（默认 `SESSION_IDLE_TIMEOUT_MS`，当前默认 30 分钟）
- `threshold`：惰性触发阈值，范围被 clamp 到 `[0, maxSessions]`

### 9.2 惰性触发策略

`collectIdle()` 不自动定时触发，只在“预计容量将超阈值”时触发：

- `create`
- `fork`
- `restore`
- `restoreAll`（逐项判断）

判断公式：

$$
sessionCount + requiredCapacity > threshold
$$

若超阈值先回收空闲会话，再校验：

$$
sessionCount + requiredCapacity \le maxSessions
$$

仍不满足则抛错。

## 10. 错误与降级行为

- 未配置 persistence 时：`save/saveAll` 为 no-op，`restore` 返回 `null`，`restoreAll` 返回 `0`。
- `branch(entryId)` 指向不存在节点时抛错。
- `create` 使用重复 id 会抛错。
- 达到容量上限且回收后仍不足会抛错。
- `createRemoteSessionManager(endpoint)` 默认注入占位 `fetch/getAuth`，在实际发起远程 I/O 前需替换为真实实现。

## 11. 扩展点

- 自定义 `SessionStore<T>`：接数据库、缓存或分布式索引。
- 自定义 `SessionPersistence<T>`：接对象存储、RPC 网关等。
- 使用 `createSessionStorage` 统一根据配置动态选择本地或远程。

## 12. 已知约束

- `Session` 接口本身不暴露 `setTitle/setTags/addTag/toSnapshot/restoreEntries`，这些能力依赖 `InMemorySession` 具体类型。
- `dispose()` 当前为 no-op，主要作为生命周期兼容入口。
- `genericFork` 只复制当前上下文消息，无法保留完整分支 DAG。
- `collectIdle()` 为同步 API，但内部不会等待 `store.deleteSession()` 的 Promise 结果；因此对异步 store，返回的 `removed` 仅表示已发起删除，不保证删除已完成或成功。
