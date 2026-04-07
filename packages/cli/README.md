# @vitamin/cli

## 模块定位
提供命令行入口与参数路由，驱动 Vitamin 运行时。

## 当前状态（基于源码）
- 包目录：`packages/cli`
- 源码文件数：3
- 测试文件数：1
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `cli.ts`
  - `index.ts`
  - `types.ts`
- `tests/`
  - `cli.test.ts`

## 公开导出
```ts
export { runCli }
```

## 开发命令
- `pnpm --filter @vitamin/cli build`
- `pnpm --filter @vitamin/cli typecheck:project`
- `pnpm --filter @vitamin/cli typecheck:file`
- `pnpm --filter @vitamin/cli typecheck`
- `pnpm --filter @vitamin/cli clean`

## 关联 Vitamin 包
- `@vitamin/ai`
- `@vitamin/coding`
- `@vitamin/hooks`
- `@vitamin/setting`
- `@vitamin/tools`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
