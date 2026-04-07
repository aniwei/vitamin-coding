# @vitamin/coding

## 模块定位
提供 Coding 场景的应用装配层，组合会话、Agent、Hook 与服务能力。

## 当前状态（基于源码）
- 包目录：`packages/coding`
- 源码文件数：9
- 测试文件数：8
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `app/`
  - `index.ts`
  - `modes/`
  - `session/`
  - `types.ts`
- `tests/`
  - `coding-session-manager.test.ts`
  - `create-agent-session.test.ts`
  - `hooks-integration.test.ts`
  - `permission-integration.test.ts`
  - `resource-loader.test.ts`
  - `run-modes.test.ts`
  - `settings-manager.test.ts`
  - `vitamin-app-slot-routing.test.ts`

## 公开导出
```ts
export { createVitamin, VitaminApp } from './app/vitamin-app'
export type { VitaminAppOptions, VitaminContext } from './types'
export { AgentSession } from './session/agent-session'
export { createAgentSession } from './session/create-agent-session'
export { CodingSessionManager, createDiskCodingSessionManager, createInMemoryCodingSessionManager, createRemoteCodingSessionManager, } from './session/coding-session-manager'
export type { CodingSessionManagerOptions as SessionManagerOptions } from './session/coding-session-manager'
export { InteractiveMode, getLastAssistantText, runJsonMode, runPrintMode, runRpcMode, } from './modes/run-modes'
export type { InteractiveResult, JsonModeResult, RpcPromptParams, RpcRequest, RpcResponse, } from './modes/run-modes'
export type { AgentSessionOptions, AgentSessionInfo, AgentSessionEvent, AgentSessionEventType, AgentSessionSubscriber, AskUserQuestion, CreateAgentSessionOptions, PromptOptions, } from './session/types'
```

## 开发命令
- `pnpm --filter @vitamin/coding run:example:auth`
- `pnpm --filter @vitamin/coding run:example`
- `pnpm --filter @vitamin/coding run:example:smoke`
- `pnpm --filter @vitamin/coding run:example:simple`
- `pnpm --filter @vitamin/coding run:example:simple:write`
- `pnpm --filter @vitamin/coding run:example:complex`
- `pnpm --filter @vitamin/coding run:example:complex:vite`
- `pnpm --filter @vitamin/coding run:example:service`
- `pnpm --filter @vitamin/coding run:example:devtools-service`
- `pnpm --filter @vitamin/coding run:example:compare`
- `pnpm --filter @vitamin/coding build`
- `pnpm --filter @vitamin/coding typecheck:project`
- `pnpm --filter @vitamin/coding typecheck:file`
- `pnpm --filter @vitamin/coding typecheck`
- `pnpm --filter @vitamin/coding clean`

## 关联 Vitamin 包
- `@vitamin/agent`
- `@vitamin/ai`
- `@vitamin/devtools`
- `@vitamin/env`
- `@vitamin/hooks`
- `@vitamin/invariant`
- `@vitamin/memory`
- `@vitamin/orchestrator`
- `@vitamin/prompt`
- `@vitamin/resources`
- `@vitamin/session`
- `@vitamin/setting`
- `@vitamin/shared`
- `@vitamin/tools`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
