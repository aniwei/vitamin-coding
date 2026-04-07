# @vitamin/mcp

## 模块定位
提供 MCP 客户端、传输层与工具适配能力。

## 当前状态（基于源码）
- 包目录：`packages/mcp`
- 源码文件数：8
- 测试文件数：0
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `index.ts`
  - `mcp-client.ts`
  - `mcp-manager.ts`
  - `mcp-resource.ts`
  - `mcp-server.ts`
  - `mcp-tool-adapter.ts`
  - `transport.ts`
  - `types.ts`
- 当前包无 `tests/` 目录或目录为空。

## 公开导出
```ts
export type {
export type { McpTransport } from './transport'
export { StdioTransport, SseTransport } from './transport'
export { McpClient, createMcpClient } from './mcp-client'
export type { McpClientOptions } from './mcp-client'
export { McpManager, createMcpManager } from './mcp-manager'
export type { McpManagerOptions } from './mcp-manager'
export { createMcpToolAdapter, createMcpToolAdapters, jsonSchemaPropertyToZod, mcpSchemaToZod, mcpContentToToolContent, } from './mcp-tool-adapter'
export { readMcpResource, findMcpResource, searchMcpResources, } from './mcp-resource'
export type { McpResourceEntry } from './mcp-resource'
export { VitaminMcpServer, createMcpServer } from './mcp-server'
export type { McpServerOptions } from './mcp-server'
```

## 开发命令
- `pnpm --filter @vitamin/mcp build`
- `pnpm --filter @vitamin/mcp dev`
- `pnpm --filter @vitamin/mcp typecheck`

## 关联 Vitamin 包
- `@vitamin/agent`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
