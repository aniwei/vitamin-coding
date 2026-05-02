# @x-mars/persistence 设计说明

## 设计目标

- 提供统一的快照式持久化抽象，支持内存、磁盘、远程三种后端。
- 通过 `Snapshot<T>` 统一版本号和元信息管理，支持乐观并发控制。
- 支持编解码器（Codec）抽象，解耦序列化格式与存储介质。
- 提供分页（Pagination）接口，支持大量快照的高效枚举。
- 磁盘写入通过临时文件 + rename 保证原子性，防止数据损坏。

## 非目标

- 不管理具体业务实体的序列化格式（由上层通过 Codec 决定）。
- 不实现数据库级别的事务保证。
- 不提供查询/过滤（只支持按 ID 的 CRUD + 全量 list）。

## 实现原理

### 核心类型

**Snapshot<T>**：

```typescript
interface Snapshot<T> {
  version: number // 版本号（乐观并发，每次写入递增）
  id: string // 唯一标识
  data: T // 泛型负载（业务数据）
  metadata: Metadata // createdAt / updatedAt / tags / 扩展字段
}
```

**Persistence<T> 接口**：

```typescript
interface Persistence<T> {
  save(snapshot: Snapshot<T>): Promise<void>
  load(id: string): Promise<Snapshot<T> | null>
  delete(id: string): Promise<boolean>
  list(): Promise<string[]>
  listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>>
}
```

**Codec<T>**：`encode(snapshot: T): string` / `decode(payload: string): T`，默认为 JSON。

### 磁盘持久化（disk-persistence.ts / file-persistence.ts）

`DiskPersistence<T>` 实现基于文件系统的持久化：

- **原子写入**：`save()` 先写 `{id}.json.tmp`，然后 `fs.rename()` 到最终路径，确保写入失败不破坏已有数据。
- **目录结构**：所有快照存于 `baseDir/` 下，文件名为 `{id}{extension}`（默认 `.json`）。
- **list/listPaginated**：扫描目录，按文件名提取 ID，按 `sortBy`（createdAt/updatedAt）和 `order`（asc/desc）排序后分页。
- **Codec 注入**：构造函数接受可选 `codec`，默认为 `JSON.stringify/parse`。

`FilePersistence` 是 `DiskPersistence` 的别名，面向 session 场景的语义化命名。

### 内存持久化（memory-persistence.ts）

`MemoryPersistence<T>` 基于 `Map<string, Snapshot<T>>`：

- 全部操作同步模拟异步接口。
- 适用于测试和不需要跨进程保存的短期场景。

### HTTP 远程持久化（http-persistence.ts / remote-persistence.ts）

`HttpPersistence<T>` / `RemotePersistence<T>` 通过 REST API 存取快照：

- `PUT /api/snapshots/{id}` → save
- `GET /api/snapshots/{id}` → load
- `DELETE /api/snapshots/{id}` → delete
- `GET /api/snapshots` → list（支持 page/pageSize/sortBy/order 查询参数）
- Bearer Token 认证，可注入自定义请求头。
- 可选 `timeoutMs`（默认 30000ms）。

### 存储工厂（storage-factory.ts）

`createPersistence<T>(options: StorageOptions<T>)` 按 `type` 字段创建对应实现：

```typescript
type StorageOptions<T> =
  | { type: 'file'; baseDir: string; extension?: string; codec?: Codec<Snapshot<T>> }
  | { type: 'http'; baseUrl: string; getAuth: () => Promise<{token: string}>; ... }
  | { type: 'memory' }
```

### 错误类型（errors.ts）

`PersistenceError`：继承 `Error`，携带 `code`（`NOT_FOUND` / `WRITE_ERROR` / `READ_ERROR` / `VERSION_CONFLICT`）和可选 `cause`。

## 调用链路

### 磁盘写入流程

```
session.save(snapshot)
       │
  DiskPersistence.save(snapshot)
       │
  JSON.stringify(snapshot) → content
       │
  writeFile(`${baseDir}/${id}.json.tmp`, content)
       │
  rename(`${id}.json.tmp`, `${id}.json`)  ← 原子操作
```

### 磁盘读取流程

```
SessionManager.restore(id)
       │
  DiskPersistence.load(id)
       │
  readFile(`${baseDir}/${id}.json`) → content
       │
  JSON.parse(content) → Snapshot<T>
       │
  返回给 SessionManager 重建 InMemorySession
```

### 分页列举流程

```
service.listSessions({ page: 1, pageSize: 20, sortBy: 'updatedAt', order: 'desc' })
       │
  DiskPersistence.listPaginated(options)
       │
  扫描 baseDir → [id1, id2, ...]
       │
  加载各快照的 metadata（仅读 metadata 部分）
       │
  按 updatedAt 降序排列
       │
  返回 page 1 的 20 条 ID
```

## 模块分层

| 文件                        | 职责                                                  |
| --------------------------- | ----------------------------------------------------- |
| `src/types.ts`              | Persistence / Snapshot / Codec / PaginatedResult 类型 |
| `src/disk-persistence.ts`   | 磁盘持久化（原子写入）                                |
| `src/file-persistence.ts`   | DiskPersistence 的语义别名                            |
| `src/memory-persistence.ts` | 内存持久化（测试用）                                  |
| `src/http-persistence.ts`   | HTTP 远程持久化                                       |
| `src/remote-persistence.ts` | RemotePersistence（扩展版 HTTP，带认证）              |
| `src/storage-factory.ts`    | 统一工厂函数                                          |
| `src/errors.ts`             | PersistenceError 专用错误类                           |
| `src/index.ts`              | barrel 导出                                           |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@x-mars/shared`、`@x-mars/env`
- **外部依赖**：无

## 测试策略

- 测试文件数：4
- 覆盖：DiskPersistence 原子写入/读取/删除/列举、MemoryPersistence CRUD、分页排序、版本冲突。

## 非目标

- 不管理具体业务实体的序列化格式（由上层决定 Codec）。
- 不实现数据库级别的事务保证。

## 实现原理

### 快照（snapshot.ts）

`Snapshot<T>` 是核心数据载体：

- `id`：唯一标识
- `version`：版本号（乐观并发控制）
- `data`：泛型负载
- `metadata`：创建/更新时间、etag、自定义扩展

### 持久化后端

#### MemoryPersistence（memory-persistence.ts）

基于 `Map<string, Snapshot<T>>` 的内存实现。支持 CRUD + list + exists。适用于测试和短期存储。

#### DiskPersistence（disk-persistence.ts）

基于文件系统的持久化：

- `save()`：写入 `.tmp` 临时文件后 `rename()`，确保原子性
- `load()` / `remove()`：标准读删操作
- `list()`：扫描目录，按 `.json` 后缀筛选
- 支持自定义编码器（默认 JSON）

#### RemotePersistence（remote-persistence.ts）

基于 HTTP REST API 的远程持久化：

- RESTful 接口：`PUT /key` / `GET /key` / `DELETE /key` / `GET /`
- Bearer Token 认证
- ETag 条件请求（If-Match）

### 编解码器（types.ts）

`Codec<T, S>` 接口：`encode(value: T): S` / `decode(raw: S): T`。支持在存储层注入自定义序列化（如压缩、加密）。

### 工厂（create-persistence.ts）

`createPersistence(config)` 根据 `{ type: 'memory' | 'disk' | 'remote', ...options }` 创建对应后端实例。

### 分页（types.ts）

`PaginatedResult<T>`：`items` + `cursor` + `hasMore`，支持大量数据的分批读取。

## 实现流程

```
调用方 --> createPersistence(config) --> Persistence<T> 实例
              |
         save(key, snapshot) --> 后端写入（内存 Map / 文件系统 / HTTP PUT）
              |
         load(key) --> Snapshot<T> | null
              |
         list(cursor?) --> PaginatedResult<Snapshot<T>>
```

磁盘写入原子性流程：

```
save(key, data)
     |
  序列化 --> JSON.stringify
     |
  写入 .tmp 临时文件
     |
  rename(.tmp --> .json)  // 原子操作
```

## 模块分层

| 文件                        | 职责                                                  |
| --------------------------- | ----------------------------------------------------- |
| `src/types.ts`              | Persistence / Snapshot / Codec / PaginatedResult 类型 |
| `src/snapshot.ts`           | Snapshot 工厂与辅助函数                               |
| `src/memory-persistence.ts` | 内存后端                                              |
| `src/disk-persistence.ts`   | 磁盘后端（原子写入）                                  |
| `src/remote-persistence.ts` | HTTP 远程后端                                         |
| `src/create-persistence.ts` | 工厂函数                                              |
| `src/index.ts`              | barrel 导出                                           |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@x-mars/shared`、`@x-mars/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：4
- 覆盖：三种后端 CRUD、快照版本控制、分页、编解码器
