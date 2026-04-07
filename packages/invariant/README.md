# @vitamin/invariant

## 模块定位

提供断言工具与构建期 invariant 清理能力。开发期精确断言，生产构建自动剥离。

## 核心功能

- `invariant(condition, message?)`：带 TypeScript asserts 子句的运行时断言
- `InvariantError`：断言失败时抛出，`framesToPop = 1`
- `invariant.debug/log/warn/error()`：按 verbosity 级别条件输出
- `setVerbosity(level)`：动态切换日志级别
- `createStripInvariantInProductionPlugin()`：tsup/esbuild 构建期剥离插件

## 目录概览

```
src/
  invariant.ts                    # 断言函数 + InvariantError
  tsup-strip-invariant-plugin.ts  # 构建期 AST 剥离插件
  index.ts                        # barrel 导出
tests/
  invariant.test.ts
  tsup-strip-invariant-plugin.test.ts
```

## 公开导出

```ts
export { invariant, InvariantError, setVerbosity } from './invariant'
export { invariant as default } from './invariant'
export type { VerbosityLevel, ConsoleFunctionName } from './invariant'
export { createStripInvariantInProductionPlugin } from './tsup-strip-invariant-plugin'
```

## 开发命令

```bash
pnpm --filter @vitamin/invariant build
pnpm --filter @vitamin/invariant typecheck
pnpm --filter @vitamin/invariant clean
```
