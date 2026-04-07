# @vitamin/persistence

## 模块定位
提供本地/远端持久化适配器与存储工厂。

## 当前状态（基于源码）
- 包目录：`packages/persistence`
- 源码文件数：9
- 测试文件数：5
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `disk-persistence.ts`
  - `errors.ts`
  - `file-persistence.ts`
  - `http-persistence.ts`
  - `index.ts`
  - `memory-persistence.ts`
  - `remote-persistence.ts`
  - `storage-factory.ts`
  - `types.ts`
- `tests/`
  - `disk-persistence.test.ts`
  - `errors.test.ts`
  - `memory-persistence.test.ts`
  - `remote-persistence.test.ts`
  - `storage-factory.test.ts`

## 公开导出
```ts
export { MemoryPersistence } from './memory-persistence'
export { DiskPersistence, } from './disk-persistence'
export type { DiskPersistenceOptions } from './disk-persistence'
export { RemotePersistence, } from './remote-persistence'
export type { RemotePersistenceOptions } from './remote-persistence'
export { FilePersistence, } from './file-persistence'
export type { FilePersistenceOptions } from './file-persistence'
export { HttpPersistence, } from './http-persistence'
export type { HttpPersistenceOptions } from './http-persistence'
export { PersistenceError, RemotePersistenceError, } from './errors'
export { createPersistence } from './storage-factory'
export type { Snapshot, Metadata, Codec, Persistence, PaginationOptions, PaginatedResult, StorageOptions, } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/persistence build`
- `pnpm --filter @vitamin/persistence typecheck:project`
- `pnpm --filter @vitamin/persistence typecheck:file`
- `pnpm --filter @vitamin/persistence typecheck`
- `pnpm --filter @vitamin/persistence clean`

## 关联 Vitamin 包
- `@vitamin/env`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
