# @vitamin/session

## 模块定位
提供会话管理、存储与会话持久化抽象。

## 当前状态（基于源码）
- 包目录：`packages/session`
- 源码文件数：9
- 测试文件数：7
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `file-persistence.ts`
  - `http-persistence.ts`
  - `in-memory-session.ts`
  - `index.ts`
  - `remote-persistence.ts`
  - `session-manager.ts`
  - `storage-factory.ts`
  - `store.ts`
  - `types.ts`
- `tests/`
  - `file-persistence.test.ts`
  - `in-memory-session.test.ts`
  - `lazy-gc.test.ts`
  - `remote-persistence.test.ts`
  - `session-manager.test.ts`
  - `storage.test.ts`
  - `store.test.ts`

## 公开导出
```ts
export { InMemorySession } from './in-memory-session'
export { InMemorySessionStore, createInMemorySessionStore } from './store'
export { FileSessionPersistence, createFileSessionPersistence, DiskSessionPersistence, createDiskSessionPersistence, } from './file-persistence'
export type { FileSessionPersistenceOptions, DiskSessionPersistenceOptions, } from './file-persistence'
export { HttpSessionPersistence, RemotePersistenceError, } from './http-persistence'
export type { HttpSessionPersistenceOptions } from './http-persistence'
export { RemoteSessionPersistence, } from './remote-persistence'
export type { RemoteSessionPersistenceOptions } from './remote-persistence'
export { SessionManager, createInMemorySessionManager, createDiskSessionManager, createRemoteSessionManager, } from './session-manager'
export type { CreateSessionManagerOptions } from './session-manager'
export { createSessionStorage } from './storage-factory'
export type { Session, SessionContext, SessionEntry, SessionMetadata, SessionStore, SessionSnapshot, SessionPersistence, SessionManagerOptions, SessionFilter, PaginationOptions, PaginatedResult, StorageOptions, RemoteStorageOptions } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/session build`
- `pnpm --filter @vitamin/session typecheck:project`
- `pnpm --filter @vitamin/session typecheck:file`
- `pnpm --filter @vitamin/session typecheck`
- `pnpm --filter @vitamin/session clean`

## 关联 Vitamin 包
- `@vitamin/env`
- `@vitamin/persistence`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
