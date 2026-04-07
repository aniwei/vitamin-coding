# @vitamin/persistence 设计说明

## 设计目标

- 提供统一的快照式持久化抽象，支持内存、磁盘、远程三种后端。
- 通过 Snapshot<T> 统一版本和元信息管理。
- 支持编解码器（Codec）抽象，解耦序列化与存储。

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

| 文件 | 职责 |
|------|------|
| `src/types.ts` | Persistence / Snapshot / Codec / PaginatedResult 类型 |
| `src/snapshot.ts` | Snapshot 工厂与辅助函数 |
| `src/memory-persistence.ts` | 内存后端 |
| `src/disk-persistence.ts` | 磁盘后端（原子写入） |
| `src/remote-persistence.ts` | HTTP 远程后端 |
| `src/create-persistence.ts` | 工厂函数 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/shared`、`@vitamin/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：4
- 覆盖：三种后端 CRUD、快照版本控制、分页、编解码器
