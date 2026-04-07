# @vitamin/mcp 设计说明

## 设计目标

- 实现 MCP（Model Context Protocol）客户端与服务端，支持工具、资源和提示的跨进程交互。
- 提供多传输层抽象（Stdio / SSE）。
- 支持将 MCP 工具适配为 AgentTool，实现无缝集成。

## 非目标

- 不实现 MCP 业务逻辑（仅协议传输层和适配层）。
- 不管理 MCP 服务器进程（由外部启动或配置驱动）。

## 实现原理

### McpClient（mcp-client.ts）

MCP 协议客户端：
- `connect(transport)` → 建立连接
- `callTool(name, args)` → 调用远程工具
- `readResource(uri)` → 读取远程资源
- `getPrompt(name, args)` → 获取远程提示
- `listTools()` / `listResources()` / `listPrompts()` → 发现能力
- JSON-RPC 2.0 协议实现

### McpManager（mcp-manager.ts）

多 MCP 服务器生命周期管理：
- `addServer(config)` → 创建并连接 McpClient
- `removeServer(name)` → 断开并清理
- `getAllTools()` → 聚合所有服务器的工具
- `getAllResources()` → 聚合所有资源
- `callTool(serverName, toolName, args)` → 路由到指定服务器
- 内部维护 `Map<string, McpClient>`

### 传输层

#### StdioTransport（stdio-transport.ts）

基于子进程的 stdin/stdout 传输：
- `spawn(command, args)` → 启动子进程
- 消息通过 JSON 行（newline-delimited JSON）传输
- 支持 stderr 捕获用于诊断
- 进程退出自动清理

#### SseTransport（sse-transport.ts）

基于 HTTP SSE 的传输：
- `connect(url)` → 建立 SSE 连接
- 发送请求通过 POST，接收响应通过 SSE 事件流
- 支持断线重连

### 工具适配器（tool-adapter.ts）

将 MCP 工具定义转换为 AgentTool：
- `mcpSchemaToZod(jsonSchema)` → JSON Schema 到 Zod schema 转换
- `createMcpToolAdapters(client)` → 从 McpClient 批量创建 AgentTool 适配器
- 每个适配器的 `execute()` 委托到 `client.callTool()`

### VitaminMcpServer（mcp-server.ts）

将 Vitamin AgentTool 暴露为 MCP 服务端：
- `tools/list` → 导出所有已注册工具
- `tools/call` → 执行工具并返回结果
- `resources/read` → 暴露资源
- 基于 JSON-RPC 2.0 实现

## 实现流程

```
配置驱动连接：
  setting.mcp.servers → McpManager.addServer(config)
       |
  创建 Transport (Stdio / SSE)
       |
  McpClient.connect(transport)
       |
  listTools() → createMcpToolAdapters() → AgentTool[]
       |
  注册到 ToolRegistry

工具调用：
  Agent → ToolExecutor → MCP 适配工具
       |
  adapter.execute(args) → mcpClient.callTool(name, args)
       |
  Transport → 远程 MCP 服务器 → 结果
       |
  返回 ToolResult

暴露本地工具：
  VitaminMcpServer.start(transport)
       |
  接收 JSON-RPC 请求
       |
  tools/call → ToolRegistry.get(name).execute()
       |
  序列化结果 → JSON-RPC 响应
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/types.ts` | McpServerConfig / McpToolDefinition / Transport 类型 |
| `src/mcp-client.ts` | MCP 客户端（JSON-RPC 2.0） |
| `src/mcp-manager.ts` | 多服务器管理 |
| `src/transports/stdio-transport.ts` | Stdio 传输 |
| `src/transports/sse-transport.ts` | SSE 传输 |
| `src/tool-adapter.ts` | MCP → AgentTool 适配 |
| `src/mcp-server.ts` | VitaminMcpServer（本地工具暴露） |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/agent`（类型）、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：`zod`

## 测试策略

- 当前无独立测试文件（通过集成测试覆盖）
