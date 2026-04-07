# @vitamin/agent

## 模块定位
封装单智能体执行循环，负责模型流式输出、工具调用与回合控制。

## 当前状态（基于源码）
- 包目录：`packages/agent`
- 源码文件数：7
- 测试文件数：5
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `agent-factory.ts`
  - `agent.ts`
  - `errors.ts`
  - `index.ts`
  - `tool-executor.ts`
  - `types.ts`
  - `work-loop.ts`
- `tests/`
  - `agent-factory.test.ts`
  - `agent-loop.test.ts`
  - `agent.test.ts`
  - `errors.test.ts`
  - `tool-executor.test.ts`

## 公开导出
```ts
export { Agent } from './agent'
export { createAgent } from './agent'
export { createAgent as createAgentWithRegistry } from './agent-factory'
export type { AgentFactoryConfig } from './agent-factory'
export type { StreamFunction } from './work-loop'
export { createToolExecutor } from './tool-executor'
export type { ToolExecutor, ToolHookExecutor } from './tool-executor'
export { AgentLoopError, ToolExecutionError, AbortError, MaxToolTurnsError, } from './errors'
export type { AgentStatus, AgentBreakpointPoint, AgentDebugSnapshot, AgentMode, AgentEvent, ToolCallEvent, ToolCallContext, CustomAgentMessages, AgentMessage, AgentState, AgentRunContext, AgentTool, ToolResult, AgentConfig, AgentLoopContext, } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/agent build`
- `pnpm --filter @vitamin/agent typecheck:project`
- `pnpm --filter @vitamin/agent typecheck:file`
- `pnpm --filter @vitamin/agent typecheck`
- `pnpm --filter @vitamin/agent clean`

## 关联 Vitamin 包
- `@vitamin/ai`
- `@vitamin/devtools`
- `@vitamin/invariant`
- `@vitamin/setting`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
