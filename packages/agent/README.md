# @vitamin/agent

无状态 Agent 执行引擎 — 双循环（work loop + steering/followUp）、工具调用、中止控制、结构化错误处理。

## 核心设计

Agent 是**无状态执行引擎**：不持有 messages、model、tools、systemPrompt。每次调用 `agent.run(context)` 由调用方（通常是 `@vitamin/coding` 的 `AgentSession`）构建完整上下文传入。

```
AgentSession（调用方）
  ├─ Session.buildContext() → 构建消息上下文
  ├─ agent.run({ model, systemPrompt, tools, messages })
  │    ├─ workLoop（内循环：stream → tool calls → stream …）
  │    ├─ steering 注入（工具间隙插入消息）
  │    └─ followUp 注入（完成后追加消息）
  └─ 新消息 → 持久化回 Session
```

## Installation

```bash
pnpm add @vitamin/agent
```

## Usage

```typescript
import { Agent } from '@vitamin/agent'

// Agent 构造只接受 stream 函数（可选）
const agent = new Agent({ stream: myStreamFn })

// 每次运行由调用方传入完整上下文
const result = await agent.run({
  model: { id: 'claude-sonnet-4-20250514', provider: 'anthropic', api: 'anthropic', contextWindow: 200_000 },
  systemPrompt: 'You are a helpful assistant.',
  tools: myTools,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  maxToolTurns: 25,
})
```

使用 `createAgentWithRegistry` 从 `ProviderRegistry` 自动构建 stream：

```typescript
import { createAgentWithRegistry } from '@vitamin/agent'

const agent = createAgentWithRegistry({
  model: myModel,
  providerRegistry: myRegistry,
})
```

## API

### `Agent`

| 方法 | 返回 | 说明 |
|------|------|------|
| `run(context)` | `Promise<AssistantMessage>` | 执行 Agent 循环，返回最终 assistant 消息 |
| `steer(message)` | `void` | Steering 注入（工具间隙插入） |
| `followUp(message)` | `void` | FollowUp 注入（完成后追加） |
| `abort()` | `void` | 中止当前运行 |
| `reset()` | `void` | 重置为 idle 状态 |
| `on(listener)` | `() => void` | 订阅 Agent 事件 |
| `getState()` | `AgentState` | 获取运行时状态快照 |

### `AgentRunContext`

每次 `run()` 由调用方构建传入：

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | `Model` | LLM 模型 |
| `systemPrompt` | `string` | 系统提示词 |
| `messages` | `AgentMessage[]` | 消息列表（workLoop 就地修改） |
| `tools` | `AgentTool[]` | 工具列表 |
| `convertToLLM?` | `(msgs) => Message[]` | 自定义消息转换 |
| `transformContext?` | `(msgs, signal?) => Promise<msgs>` | 上下文转换（压缩/裁剪/注入） |
| `maxToolTurns?` | `number` | 最大连续工具轮次（默认 25） |
| `thinkingLevel?` | `ThinkingLevel` | 思维级别 |
| `maxTokens?` | `number` | 最大输出 token |
| `temperature?` | `number` | 温度 |
| `devtools?` | `Devtools` | 开发工具 |

## Key Exports

| Export | Description |
|--------|-------------|
| `Agent`, `createAgent` | Agent 类和工厂函数 |
| `createAgentWithRegistry` | 从 ProviderRegistry 自动构建 stream 的工厂 |
| `createToolExecutor` | 工具执行器 |
| `AgentLoopError`, `ToolExecutionError`, `AbortError`, `MaxToolTurnsError` | 错误类型 |

## Types

`AgentStatus`, `AgentMode`, `AgentEvent`, `ToolCallEvent`, `ToolCallContext`, `AgentMessage`, `CustomAgentMessages`, `AgentState`, `AgentRunContext`, `AgentLoopContext`, `AgentTool`, `ToolResult`, `AgentConfig`, `AgentFactoryConfig`, `AgentEventListener`, `AgentBreakpointPoint`, `AgentDebugSnapshot`, `StreamFunction`, `ToolExecutor`, `ToolHookExecutor`

## Build Behavior

- Source keeps development assertions (`invariant` from `@vitamin/invariant`) in `src/agent.ts`.
- When building with `NODE_ENV=production`, `tsup` strips those assertion blocks from emitted JS.
- When building with `NODE_ENV=development` (or unset), assertions remain in output.

## License

See [root README](../../README.md) for details.
