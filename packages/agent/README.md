# @vitamin/agent

## 模块定位

封装单智能体执行循环，负责模型流式输出、工具调用与回合控制。提供状态机驱动的 Agent 生命周期管理。

## 核心功能

| 模块 | 功能 |
|------|------|
| Agent | 状态机驱动的执行引擎，15 种生命周期事件 |
| WorkLoop | 核心执行循环（readonly 并行 + mutation 串行 + steering 检查） |
| ToolExecutor | 工具执行管线（beforeHooks -> validate -> execute -> afterHooks） |
| AgentFactory | 基于 Registry 的 Agent 创建工厂 |

## AgentTool 接口

```ts
interface AgentTool<Params = unknown> {
  name: string
  description: string
  parameters: ZodType<Params>
  visibility?: 'always' | 'when-enabled' | 'when-requested'
  readonly?: boolean          // true 时可并行执行
  execute: (ctx: ToolCallContext<Params>) => Promise<ToolResult>
}
```

## Agent 事件

`status_change` / `turn_start` / `turn_end` / `stream_event` / `streaming_start` / `streaming_end` / `tool_call_start` / `tool_call_end` / `tool_result_received` / `messages_updated` / `steering_injected` / `follow_up_start` / `error` / `abort` / `compaction_needed`

## 目录概览

```
src/
  types.ts           # 核心类型
  agent.ts           # Agent 状态机
  agent-factory.ts   # Agent 工厂
  work-loop.ts       # 执行循环
  tool-executor.ts   # 工具执行器
  errors.ts          # 错误类型
  index.ts           # barrel 导出
tests/               # 5 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/agent build
pnpm --filter @vitamin/agent typecheck
pnpm --filter @vitamin/agent clean
```

## 关联包

`@vitamin/ai`、`@vitamin/setting`、`@vitamin/shared`、`@vitamin/invariant`、`@vitamin/devtools`
