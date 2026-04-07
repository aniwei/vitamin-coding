# @vitamin/swarm

多 Agent 协作框架 — 支持 Handoff 交接、路由策略、多种编排模式（顺序、并行、层级）。

## 安装

```bash
pnpm add @vitamin/swarm
```

## 核心概念

- **Swarm** — 多 Agent 协作容器，管理 Agent 定义、路由和执行
- **SwarmRouter** — 路由器，根据策略和规则决定下一个执行的 Agent
- **Handoff** — Agent 间的任务交接机制
- **编排模式** — 支持顺序、并行、层级三种编排模式

## 快速开始

```typescript
import { createSwarm, createRouter, createHandoffTool } from '@vitamin/swarm'

const swarm = createSwarm({
  agents: {
    planner: {
      name: 'planner',
      instructions: 'You plan tasks.',
      tools: [],
      handoffs: ['executor'],
    },
    executor: {
      name: 'executor',
      instructions: 'You execute tasks.',
      tools: [],
      handoffs: [],
    },
  },
  defaultAgent: 'planner',
})

const result = await swarm.run({
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Plan and execute this task' }] }],
})
```

## 编排模式

### 顺序执行

```typescript
import { executeSequential } from '@vitamin/swarm'

const result = await executeSequential(steps, context)
```

### 并行执行

```typescript
import { executeParallel } from '@vitamin/swarm'

const results = await executeParallel(tasks, context)
```

### 层级执行

```typescript
import { executeHierarchical } from '@vitamin/swarm'

const result = await executeHierarchical(task, context)
```

## Key Exports

### 核心类

| Export | Description |
|--------|-------------|
| `Swarm`, `createSwarm` | Swarm 容器类和工厂函数 |
| `SwarmRouter`, `createRouter` | 路由器类和工厂函数 |

### Handoff

| Export | Description |
|--------|-------------|
| `createHandoffTool` | 创建 Handoff 工具 |
| `validateHandoff` | 验证 Handoff 请求 |

### 编排模式

| Export | Description |
|--------|-------------|
| `executeSequential` | 顺序执行 |
| `executeParallel` | 并行执行 |
| `executeHierarchical` | 层级执行 |
| `executeAgentTurn` | 单 Agent 轮次执行 |

### 上下文

| Export | Description |
|--------|-------------|
| `createSwarmContext` | 创建 Swarm 上下文 |
| `buildCallGraph` | 构建调用图 |

### 错误类型

`HandoffTargetError`, `HandoffDepthError`, `HandoffNotAllowedError`, `RoutingError`, `PipelineError`, `AgentNotFoundError`, `SwarmConfigError`

## Types

`SwarmAgentId`, `SwarmAgentDef`, `HandoffRequest`, `HandoffResult`, `RoutingStrategy`, `RoutingDecision`, `RouteRule`, `RouterConfig`, `OrchestrationPattern`, `PipelineStepResult`, `ParallelTask`, `ParallelResult`, `HierarchicalTask`, `HierarchicalResult`, `SwarmContext`, `SwarmTurnResult`, `SwarmConfig`, `SwarmRunContextFactory`, `SwarmEvent`, `SwarmEventHandler`

## License

See [root README](../../README.md) for details.
