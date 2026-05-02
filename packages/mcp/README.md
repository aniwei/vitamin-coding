# @x-mars/mcp

## 模块定位

实现 MCP（Model Context Protocol）客户端与服务端，支持工具/资源/提示的跨进程交互，提供 Stdio 和 SSE 双传输层。

## 核心功能

| 模块           | 功能                                              |
| -------------- | ------------------------------------------------- |
| McpClient      | MCP 客户端（callTool / readResource / getPrompt） |
| McpManager     | 多服务器生命周期管理 + 工具/资源聚合              |
| StdioTransport | 子进程 stdin/stdout 传输                          |
| SseTransport   | HTTP SSE 传输 + 断线重连                          |
| Tool Adapter   | MCP 工具 → AgentTool 适配（JSON Schema → Zod）    |
| XMarsMcpServer | 将本地 AgentTool 暴露为 MCP 服务端                |

## 目录概览

```
src/
  types.ts                    # 核心类型
  mcp-client.ts               # MCP 客户端
  mcp-manager.ts              # 多服务器管理
  transports/
    stdio-transport.ts        # Stdio 传输
    sse-transport.ts          # SSE 传输
  tool-adapter.ts             # 工具适配
  mcp-server.ts               # MCP 服务端
  index.ts
```

## 开发命令

```bash
pnpm --filter @x-mars/mcp build
pnpm --filter @x-mars/mcp typecheck
pnpm --filter @x-mars/mcp clean
```

## 关联包

`@x-mars/agent`、`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
