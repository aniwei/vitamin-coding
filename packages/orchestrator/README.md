# @vitamin/orchestrator

面向 Vitamin runtime 的轻量任务编排层。当前实现以 `Orchestrator`、`TaskExecutor`、`TaskStore`、`BackgroundManager`、`RetryPolicy` 和 `CircuitBreaker` 为核心，通过宿主注入的 `runSession()` 闭包把 task tool surface 接到真实的 session runtime。

## 当前边界

- 当前公开入口以 [src/index.ts](src/index.ts) 为准。
- `Orchestrator` 直接暴露 `dispatchTask`、`callAgent`、`createTask`、`getTask`、`listTasks`、`updateTask`、`getBackgroundOutput`、`cancelBackground`、`clarifyRequest` 这 9 个回调。
- `runSession()` 是宿主必须提供的桥接闭包，负责创建或复用 session、执行 prompt，并返回文本结果与 sessionId。
- `TaskStore` 当前是内存实现；任务状态不会跨进程持久化。
- `callAgent()` 当前是同步、隔离的直接调用：它直接走一次 `runSession({ sessionMode: 'ephemeral' })`，不创建 task 记录，也不进入重试、熔断或后台任务链。
- `clarifyRequest()` 当前固定通过 agent 名称 `lead` 发起一次 `callAgent()`，失败时返回 `lead_agent` escalation。
- `workflowConfig` 的实际类型是 `WorkflowOptions`；当前只有 retry 和 circuit breaker 真正接入执行链。
- `maxBackgroundTasks` 与 `defaultMaxAttempts` 虽然出现在 `OrchestratorOptions` 中，但当前源码尚未消费；`TaskStore` 仍固定写入 `maxAttempts = 3`。
- `Fleet*` 类型目前只是 Phase 2 预留类型，还没有进入执行链。
- 当前没有 `createOrchestrator()` 工厂、`toToolCallbacks()` 聚合器、`perform_work` 计划执行器、`ClarifyChannel` 或计划文件加载器。

## 安装

```bash
pnpm add @vitamin/orchestrator
```

## 快速开始

```ts
import { HookRegistry } from '@vitamin/hooks'
import { Orchestrator } from '@vitamin/orchestrator'

const orchestrator = new Orchestrator({
  hookRegistry: new HookRegistry(),
  runSession: async ({ prompt, sessionId, sessionMode, agentName, slot }) => {
    const resolvedSessionId = sessionId ?? crypto.randomUUID()

    // 真实接入时，这里应该桥接到宿主自己的 session runtime。
    return {
      text: `[${agentName ?? 'default'}|${slot ?? 'normal'}|${sessionMode}] ${prompt}`,
      sessionId: resolvedSessionId,
      durationMs: 42,
    }
  },
})

const result = await orchestrator.dispatchTask({
  prompt: 'Review this diff and summarize risks',
  subagent: 'quality-reviewer',
  slot: 'critique',
  mode: 'sync',
})

console.log(result)
orchestrator.dispose()
```

## 运行时结构

```text
new Orchestrator(options)
  -> create TaskStore
  -> create RetryPolicy / CircuitBreaker
  -> create TaskExecutor
  -> create BackgroundManager

dispatchTask()
  -> maxActiveTasks gate
  -> circuitBreaker gate
  -> create task record
  -> runSession()
  -> update task state + emit hooks

callAgent()
  -> runSession({ agentName, sessionMode: 'ephemeral' })
  -> return output directly (no TaskStore / RetryPolicy / CircuitBreaker)

background_output / background_cancel
  -> BackgroundManager
```

## 主要导出

### Runtime

- `Orchestrator`
- `TaskStore`
- `RetryPolicy`
- `CircuitBreaker`

### Contracts

- `RunSessionOptions`
- `RunSessionResult`
- `OrchestratorOptions`
- `OrchestratorDeps`
- `WorkflowOptions`

### Task Types

- `Task`
- `TaskStatus`
- `TaskInput`
- `TaskOutput`
- `TaskError`

### Future-facing Types

- `FleetStrategy`
- `FleetSpec`
- `FleetMember`
- `FleetResult`
- `RetryConfig`
- `CircuitBreakerConfig`

## 组件说明

### Orchestrator

负责把工具层需要的 task callbacks 组织成统一运行时对象。它自身不创建 session、不理解 provider/model，也不持有 prompt 逻辑，只负责 task state、hook 发射和对 `runSession()` 的调用。

### TaskExecutor

负责任务派发与执行主链：并发上限检查、熔断检查、创建任务、执行 `runSession()`、处理重试、写回结果，并发射 `task.created`、`task.started`、`task.completed`、`task.failed`。

### TaskStore

当前是最小内存实现，用 `Map` 保存任务。它提供 create/get/list/update/delete，但没有持久化、索引或恢复能力。

### BackgroundManager

负责后台任务的轮询与取消。取消是协作式的：先把任务状态改成 `cancelled`，再调用宿主注入的 `abortTask()`。

### RetryPolicy / CircuitBreaker

两者都从 `workflowConfig` 读取配置。`RetryPolicy` 决定失败后是否退避重试；`CircuitBreaker` 在连续失败后短路新的 dispatch 请求，并在超时后自动半开恢复。

## 当前限制

- 当前任务存储仅在内存中。
- `runSession()` 返回值只要求文本结果，不承载结构化审查、计划工件或多分支聚合结果。
- `clarifyRequest()` 仍是最小实现，固定把澄清问题转给名为 `lead` 的 agent。
- `updateTask('retry')` 通过重新走 `dispatchTask()` 完成重试，而不是恢复原 task 的独立执行上下文。
- `Fleet*` 类型、`maxBackgroundTasks`、`defaultMaxAttempts` 仍未进入主链。

## 进一步阅读

- 当前设计：[DESIGN.md](DESIGN.md)
- 核心实现：[src/orchestrator.ts](src/orchestrator.ts)
- 执行器：[src/executor.ts](src/executor.ts)
- 重试与熔断：[src/retry.ts](src/retry.ts)

## License

See root package metadata for details.