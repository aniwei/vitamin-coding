# @vitamin/devtools

## 模块定位
提供调试服务、断点与调试协议，实现可观测执行链路。

## 当前状态（基于源码）
- 包目录：`packages/devtools`
- 源码文件数：9
- 测试文件数：5
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `devtools.ts`
  - `index.ts`
  - `protocol.ts`
  - `service-worker.ts`
  - `service.ts`
  - `tools/`
  - `types.ts`
- `tests/`
  - `breakpoints.test.ts`
  - `debugger-controller.test.ts`
  - `devtools.test.ts`
  - `sab-writeback.test.ts`
  - `service.test.ts`

## 公开导出
```ts
export * from './devtools'
export * from './protocol'
export * from './service'
export * from './tools/debugger'
export * from './tools/breakpoints'
```

## 开发命令
- `pnpm --filter @vitamin/devtools build`
- `pnpm --filter @vitamin/devtools typecheck:project`
- `pnpm --filter @vitamin/devtools typecheck:file`
- `pnpm --filter @vitamin/devtools typecheck`
- `pnpm --filter @vitamin/devtools clean`

## 关联 Vitamin 包
- `@vitamin/invariant`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
