# @vitamin/swarm

## 模块定位
提供多 Agent 协作（Swarm）路由、交接与上下文控制。

## 当前状态（基于源码）
- 包目录：`packages/swarm`
- 源码文件数：12
- 测试文件数：4
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `context.ts`
  - `errors.ts`
  - `handoff.ts`
  - `index.ts`
  - `patterns/`
  - `router.ts`
  - `swarm.ts`
  - `types.ts`
- `tests/`
  - `context.test.ts`
  - `handoff.test.ts`
  - `router.test.ts`
  - `swarm.test.ts`

## 公开导出
```ts
export { Swarm, createSwarm } from './swarm'
export type { SwarmRunResult } from './swarm'
export { SwarmRouter, createRouter } from './router'
export { createHandoffTool, validateHandoff } from './handoff'
export { createSwarmContext, buildCallGraph } from './context'
export { executeSequential, executeParallel, executeHierarchical, executeAgentTurn, } from './patterns'
export { HandoffTargetError, HandoffDepthError, HandoffNotAllowedError, RoutingError, PipelineError, AgentNotFoundError, SwarmConfigError, } from './errors'
export type {
```

## 开发命令
- `pnpm --filter @vitamin/swarm build`
- `pnpm --filter @vitamin/swarm typecheck:project`
- `pnpm --filter @vitamin/swarm typecheck:file`
- `pnpm --filter @vitamin/swarm typecheck`
- `pnpm --filter @vitamin/swarm clean`

## 关联 Vitamin 包
- `@vitamin/agent`
- `@vitamin/ai`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
