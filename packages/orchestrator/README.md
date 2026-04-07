# @vitamin/orchestrator

## 模块定位

管理多 Agent 任务的创建、调度、重试与生命周期。提供 TaskStore + TaskExecutor + CircuitBreaker 组合。

## 核心功能

| 模块 | 功能 |
|------|------|
| TaskStore | 任务 CRUD + 状态追踪（pending/running/completed/failed） |
| TaskExecutor | 同步/后台混合调度 + 并发限制 |
| RetryPolicy | 指数退避 + 抖动重试策略 |
| CircuitBreaker | 断路器（CLOSED/OPEN/HALF_OPEN） |
| Orchestrator | 业务级 API（dispatchTask/callAgent/writeTodos/clarifyRequest） |
| BackgroundManager | 后台异步任务生命周期 |

## 目录概览

```
src/
  types.ts              # 核心类型
  task-store.ts         # 任务存储
  task-executor.ts      # 执行引擎
  retry-policy.ts       # 重试策略
  circuit-breaker.ts    # 断路器
  orchestrator.ts       # 顶层协调器
  background-manager.ts # 后台管理
  index.ts
tests/                  # 6 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/orchestrator build
pnpm --filter @vitamin/orchestrator typecheck
pnpm --filter @vitamin/orchestrator clean
```

## 关联包

`@vitamin/agent`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
