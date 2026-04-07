# @vitamin/agent 设计说明

## 设计目标

- 封装单智能体执行循环，负责模型流式输出、工具调用与回合控制。
- 提供状态机驱动的 Agent 生命周期管理。
- 支持只读工具并行执行、写工具串行+方向检查的混合执行策略。

## 非目标

- 不负责多 Agent 编排（由 `@vitamin/orchestrator` / `@vitamin/swarm` 承担）。
- 不管理会话持久化。

## 实现原理

### Agent 状态机（agent.ts）

Agent 类基于 `TypedEventEmitter` 实现 15 种生命周期事件的发射。核心状态：`idle -> streaming -> tool_executing -> completed/error/aborted`。通过 `VALID_TRANSITIONS` 表校验合法状态转换。

关键能力：
- `run(context)`：主执行入口，修改消息数组（in-place）
- `steer(message)`：执行中注入转向消息
- `followUp(message)`：注入后续追问
- `abort()`：优雅中止
- `getState()`：不可变状态快照

### 工作循环（work-loop.ts）

核心算法：
```
while true:
  1. 上下文变换（压缩/裁剪）
  2. AgentMessage[] -> LLM Message[] 格式转换
  3. 调用 LLM stream() -> AssistantMessage
  4. 检查是否有工具调用：
     有 ->
       a. 检查 steering 队列 -> 有则注入并中断
       b. 分离工具：readonly（并行） vs mutation（串行+方向检查）
       c. 执行 readonly 工具（Promise.all）
       d. 串行执行 mutation 工具，每个之间检查 steering
       e. 推入 tool_result 消息
     无 -> 退出循环
  5. 检查 followUp 队列 -> 有则追加并继续循环
  end
返回最后的 AssistantMessage
```

关键特性：
- **Readonly 并行优化**：标记 `readonly: true` 的工具并行执行
- **Mutation 安全串行**：写工具按序执行，每个之间检查转向队列
- **Token 累计**：跨回合累加 input/output/cacheRead token
- **断点集成**：关键阶段提供暂停点（loop_start / model_before / tool_before 等）

### 工具执行器（tool-executor.ts）

执行管线：
1. 按名称解析工具
2. 执行 beforeHooks（权限检查、参数变换）
3. Zod schema 参数校验
4. 执行 `tool.execute(context)`
5. 执行 afterHooks（日志、分析、结果变换）
6. 返回 ToolResult

### 错误类型（errors.ts）

- `AgentLoopError`：执行循环错误（附带当前回合信息）
- `ToolExecutionError`：工具执行错误（附带工具名和参数）
- `AbortError`：用户主动中止
- `MaxToolTurnsError`：超出最大工具回合数

## 实现流程

```
调用方 --> agent.run(context)
              |
        WorkLoop 开始
              |
  [循环] LLM stream() --> AssistantMessage
              |
        有工具调用?
       /           \
      是             否
      |              |
  分离 readonly      退出循环
  / mutation         |
  |                  返回 lastAssistantMessage
  并行执行 readonly
  串行执行 mutation（含 steering 检查）
  推入 tool_result
  继续循环
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/types.ts` | AgentTool / AgentConfig / AgentEvent / AgentState 等核心类型 |
| `src/agent.ts` | Agent 状态机 + 事件发射 |
| `src/agent-factory.ts` | 基于 Registry 的 Agent 工厂 |
| `src/work-loop.ts` | 核心执行循环算法 |
| `src/tool-executor.ts` | 工具执行管线（Hook 前后置） |
| `src/errors.ts` | 4 种专用错误类 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/ai`、`@vitamin/setting`、`@vitamin/shared`、`@vitamin/invariant`、`@vitamin/devtools`
- **外部依赖**：无

## 测试策略

- 测试文件数：5
- 覆盖：Agent 工厂、Agent 循环、Agent 状态机、错误类型、工具执行器
