# @vitamin/tools

## 模块定位
提供内置工具注册、工具协议与多域工具实现。

## 当前状态（基于源码）
- 包目录：`packages/tools`
- 源码文件数：58
- 测试文件数：20
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `binary/`
  - `fs/`
  - `index.ts`
  - `lock.ts`
  - `lsp/`
  - `mcp/`
  - `orchestration/`
  - `register-builtin.ts`
  - `search/`
  - `session/`
  - `shell/`
  - `skill/`
- `tests/`
  - `binary-tools.test.ts`
  - `builtin-orchestration-registration.test.ts`
  - `builtin-tools-coverage.test.ts`
  - `builtin-tools.test.ts`
  - `extended-tools.test.ts`
  - `fs-diff.test.ts`
  - `full-preset-tools.test.ts`
  - `lsp-tool-factories.test.ts`
  - `lsp.test.ts`
  - `mcp-client.test.ts`
  - `mcp-manager.test.ts`
  - `mcp-tool-adapter.test.ts`

## 公开导出
```ts
export { ToolRegistry, createToolRegistry } from './tool-registry'
export { registerBuiltinTools } from './register-builtin'
export type { RegisterBuiltinOptions } from './register-builtin'
export { McpManager, createMcpManager, McpClient, createMcpClient } from './mcp'
export { createMcpToolAdapter, createMcpToolAdapters } from './mcp'
export type { McpManagerOptions, McpClientOptions, McpServerConfig, McpToolDefinition, McpClientStatus, McpServerInfo, } from './mcp'
export { validateToolArgs } from './tool-validator'
export type { ValidationResult } from './tool-validator'
export type { TaskDispatch } from './orchestration/task-delegate'
export type { GetBackgroundOutput } from './orchestration/background-task-output'
export type { CancelBackground } from './orchestration/background-task-cancel'
export type { CallAgent } from './orchestration/agent-call'
export type { CreateTask } from './orchestration/task-create'
export type { GetTask } from './orchestration/task-get'
export type { ListTasks } from './orchestration/task-list'
export type { UpdateTask } from './orchestration/task-update'
export type { ClarifyRequest } from './orchestration/clarify-request'
export { createWriteTodos } from './orchestration/write-todos'
export type { WriteTodos, TodoItem } from './orchestration/write-todos'
export { createCaptureFileState } from './orchestration/capture-file-state'
export type { CaptureFileState } from './orchestration/capture-file-state'
export { createLearn } from './orchestration/learn'
export type { LearnCallback } from './orchestration/learn'
export { createWebFetch } from './web/fetch'
export { createWebSearch } from './web/search'
export { createSessionManager } from './session/session-manager'
export type { SessionManager } from './session/session-manager'
export type { LoadSkill } from './skill/skill-load'
export type { ExecuteSkill } from './skill/skill-execute'
export { createLspDefinition, createLspReferences, createLspSymbols, createLspDiagnostics, createLspPrepareRename, createLspRename, } from './lsp'
export { withLspClient, findWorkspaceRoot } from './lsp'
export { LSPClient, lspManager } from './lsp'
export type { LSPServerConfig, Location, LocationLink, SymbolInfo, DocumentSymbol, Diagnostic as LspDiagnostic, WorkspaceEdit, PrepareRenameResult, ServerLookupResult, ResolvedServer, } from './lsp'
export type { ToolPreset, ToolMetadata, RegisteredTool, ToolRegistrationOptions, ToolFactory, } from './types'
export { BinaryToolExecutorRegistry, createBinaryToolExecutorRegistry, } from './binary/binary-executor-registry'
```

## 开发命令
- `pnpm --filter @vitamin/tools build`
- `pnpm --filter @vitamin/tools typecheck:project`
- `pnpm --filter @vitamin/tools typecheck:file`
- `pnpm --filter @vitamin/tools typecheck`
- `pnpm --filter @vitamin/tools clean`

## 关联 Vitamin 包
- `@vitamin/agent`
- `@vitamin/ai`
- `@vitamin/env`
- `@vitamin/hooks`
- `@vitamin/invariant`
- `@vitamin/mcp`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
