# @vitamin/orchestrator

## 模块定位
提供多智能体编排执行器、任务存储与治理能力。

## 当前状态（基于源码）
- 包目录：`packages/orchestrator`
- 源码文件数：7
- 测试文件数：5
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `background-manager.ts`
  - `executor.ts`
  - `index.ts`
  - `orchestrator.ts`
  - `retry.ts`
  - `task-store.ts`
  - `types.ts`
- `tests/`
  - `background-manager.test.ts`
  - `executor.test.ts`
  - `orchestrator.test.ts`
  - `retry.test.ts`
  - `task-store.test.ts`

## 公开导出
```ts
export type { Task, TaskStatus, TaskInput, TaskOutput, TaskError, OrchestratorOptions, WorkflowOptions, FleetStrategy, FleetSpec, FleetMember, FleetResult, } from './types'
export { TaskStore } from './task-store'
export { Orchestrator } from './orchestrator'
export type { OrchestratorDeps } from './orchestrator'
export type { RunSessionOptions, RunSessionResult } from './executor'
export { RetryPolicy, CircuitBreaker } from './retry'
export type { RetryConfig, CircuitBreakerConfig } from './retry'
```

## 开发命令
- `pnpm --filter @vitamin/orchestrator build`
- `pnpm --filter @vitamin/orchestrator typecheck:project`
- `pnpm --filter @vitamin/orchestrator typecheck:file`
- `pnpm --filter @vitamin/orchestrator typecheck`
- `pnpm --filter @vitamin/orchestrator clean`

## 关联 Vitamin 包
- `@vitamin/agent`
- `@vitamin/hooks`
- `@vitamin/setting`
- `@vitamin/shared`
- `@vitamin/tools`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
