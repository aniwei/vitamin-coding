# @vitamin/invariant

## 模块定位
提供断言工具与构建期 invariant 清理能力。

## 当前状态（基于源码）
- 包目录：`packages/invariant`
- 源码文件数：3
- 测试文件数：2
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `index.ts`
  - `invariant.ts`
  - `tsup-strip-invariant-plugin.ts`
- `tests/`
  - `invariant.test.ts`
  - `tsup-strip-invariant-plugin.test.ts`

## 公开导出
```ts
export { invariant, InvariantError, setVerbosity } from './invariant'
export { invariant as default } from './invariant'
export type { VerbosityLevel, ConsoleFunctionName } from './invariant'
export { createStripInvariantInProductionPlugin } from './tsup-strip-invariant-plugin'
```

## 开发命令
- `pnpm --filter @vitamin/invariant build`
- `pnpm --filter @vitamin/invariant typecheck:project`
- `pnpm --filter @vitamin/invariant typecheck:file`
- `pnpm --filter @vitamin/invariant typecheck`
- `pnpm --filter @vitamin/invariant clean`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
