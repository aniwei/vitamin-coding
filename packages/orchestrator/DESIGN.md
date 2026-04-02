# Vitamin Orchestrator Runtime 设计

## 设计目标

- 为 task tools 提供统一的运行时回调面。
- 把“如何跑一个子任务”收敛到一个宿主注入的 `runSession()` 契约里。
- 保持实现最小但可组合：任务状态、后台控制、重试、熔断、hook 发射。
- 不在 orchestrator 内部绑定具体 model、provider、prompt 或 session 容器。

## 架构总览

```text
tool callbacks
  -> Orchestrator
    -> TaskExecutor
      -> TaskStore
      -> RetryPolicy
      -> CircuitBreaker
      -> runSession(options)
    -> BackgroundManager
```

当前 orchestrator 是“任务调度薄层”，而不是独立 agent runtime。真正的会话创建、模型路由、prompt 组装和文本抽取都在宿主侧完成。

## runSession 契约

`runSession()` 是当前包最关键的边界：

- 输入：`prompt`、`sessionId?`、`sessionMode`、`agentName?`、`slot?`
- 输出：`text`、`sessionId`、`tokenUsage?`、`durationMs`

字段含义：

- `prompt`：当前 task 或 agent_call 需要执行的文本输入。
- `sessionId`：sticky 场景下由宿主决定是否复用已有 session。
- `sessionMode`：`ephemeral` 或 `sticky`，只表达会话策略意图。
- `agentName`：subagent 名称，供宿主路由不同 agent 配置。
- `slot`：模型槽位提示，供宿主选模。

这意味着 orchestrator 不知道 session 的内部实现，只知道“给定这些路由信息，宿主能返回一段文本结果”。

## 核心组件

### Orchestrator

`Orchestrator` 负责：

- 创建 `TaskStore`、`TaskExecutor`、`BackgroundManager`
- 从 `workflowConfig` 派生 `RetryPolicy` 和 `CircuitBreaker`
- 暴露和 tool contract 对齐的 9 个回调
- 在 dispose 时重置熔断器状态

当前直接暴露的方法面是：

- `dispatchTask`
- `callAgent`
- `createTask`
- `getTask`
- `listTasks`
- `updateTask`
- `getBackgroundOutput`
- `cancelBackground`
- `clarifyRequest`

### TaskExecutor

`TaskExecutor` 是执行主链：

1. 统计 `running` 任务，执行 `maxActiveTasks` 并发限制。
2. 检查 `CircuitBreaker.isOpen()`。
3. 创建 task record，并发射 `task.created`。
4. 将 task 状态切到 `running`，发射 `task.started`。
5. 调用 `runSession()`。
6. 成功时写回 `completed`、`output`、`sessionId`，并发射 `task.completed`。
7. 失败时按 `RetryPolicy` 退避重试；最终失败则写回 `failed` 并发射 `task.failed`。

### TaskStore

`TaskStore` 当前是内存版 `Map<string, Task>`：

- `create()` 生成 `task_<timestamp>_<counter>` 格式 ID
- `sessionPolicy` 从 `input.sessionMode` 派生
- `maxAttempts` 当前固定写死为 `3`

这是当前实现最明确的边界之一：类型面虽然预留了更多策略位，但存储层仍是最小实现。

### BackgroundManager

后台管理只做两件事：

- `getOutput(id)`：把 task 状态映射成工具友好的查询结果
- `cancel(id)`：把非终态任务改成 `cancelled`，并调用宿主提供的 `abortTask()`

它不维护单独的后台队列，也不追踪 stdout/stderr 流；所有状态都回落到 `TaskStore`。

### RetryPolicy 与 CircuitBreaker

两者都从 `WorkflowOptions` 派生：

- `RetryPolicy` 关心 `enabled`、`maxAttempts`、指数退避配置
- `CircuitBreaker` 关心 `enabled`、`failureThreshold`、`resetTimeoutMs`

当前真正接入执行链的是：

- dispatch 前的熔断拒绝
- 执行失败后的自动重试
- 成功时重置熔断统计

## Task 生命周期

当前 task 生命周期是：

```text
pending -> running -> completed
pending -> running -> failed
pending -> running -> cancelled
failed -> retry -> pending -> running -> ...
```

注意两点：

- 后台任务与同步任务共享同一套状态机，只是 dispatch 返回时机不同。
- `updateTask('retry')` 并不是“恢复旧执行栈”，而是重新以 task 输入再触发一轮 dispatch。

## Tool Callback 映射

当前与 `@vitamin/tools` 的直接映射关系是：

- `task_delegate` -> `dispatchTask`
- `agent_call` -> `callAgent`
- `task_create` -> `createTask`
- `task_get` -> `getTask`
- `task_list` -> `listTasks`
- `task_update` -> `updateTask`
- `background_output` -> `getBackgroundOutput`
- `background_cancel` -> `cancelBackground`
- `clarify_request` -> `clarifyRequest`

以下能力不在当前 orchestrator 中：

- `perform_work`
- `loadSkill` / `executeSkill`
- `writeTodos`
- `captureFileState`
- `learn`
- `sessionManager`

这些回调要么已不存在于当前 tool surface，要么由更高层 runtime 注入。

## 当前边界

- 当前没有持久化 TaskStore。
- 当前没有 `createOrchestrator()` 工厂或 `toToolCallbacks()` 聚合辅助函数。
- 当前没有计划文件执行器、PlanLoader、ClarifyChannel。
- `clarifyRequest()` 仍然硬编码向 `lead` agent 发起会话请求。
- `Fleet*` 类型仅保留为后续扩展契约，还没有运行时实现。
- `OrchestratorOptions.maxBackgroundTasks` 与 `defaultMaxAttempts` 尚未被主链消费。

## 设计结论

当前 orchestrator 已经不是占位包，而是一个可工作的最小任务编排运行时；但它仍然刻意保持“薄层”定位。要理解真实系统边界，关键不是把它看成独立控制器，而是把它看成：

`task tools` 与 `宿主 session runtime` 之间的一层状态协调与执行治理桥接。