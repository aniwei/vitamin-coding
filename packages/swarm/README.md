# @vitamin/swarm

## 模块定位

提供多 Agent 协作的 5 种编排模式和 5 种路由策略，通过 SwarmContext 实现跨 Agent 共享状态。

## 核心功能

| 模块 | 功能 |
|------|------|
| Handoff | Agent 间直接转交控制权（含深度限制） |
| Sequential | 管道串行，上游输出→下游输入 |
| Parallel | 并发执行 + maxConcurrency + 结果聚合 |
| Hierarchical | Supervisor-Worker 层级协作 |
| Router | 动态任务路由（5 种策略） |
| SwarmContext | 跨 Agent 共享状态容器 |

## 路由策略

| 策略 | 说明 |
|------|------|
| `llm` | LLM 分析任务选择 Agent |
| `rule` | 正则/关键词规则匹配 |
| `round-robin` | 轮询分发 |
| `random` | 随机选择 |
| `custom` | 自定义回调 |

## 目录概览

```
src/
  types.ts           # 核心类型
  swarm.ts           # 入口 + 模式分发
  handoff.ts         # Handoff 模式
  sequential.ts      # Sequential 模式
  parallel.ts        # Parallel 模式
  hierarchical.ts    # Hierarchical 模式
  router.ts          # Router 模式
  swarm-router.ts    # 路由策略
  swarm-context.ts   # 共享状态
  index.ts
```

## 开发命令

```bash
pnpm --filter @vitamin/swarm build
pnpm --filter @vitamin/swarm typecheck
pnpm --filter @vitamin/swarm clean
```

## 关联包

`@vitamin/agent`、`@vitamin/ai`、`@vitamin/shared`、`@vitamin/invariant`
