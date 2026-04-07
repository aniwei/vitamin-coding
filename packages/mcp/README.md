# @vitamin/mcp

MCP (Model Context Protocol) 模块 — 管理外部 MCP Server 连接、工具适配以及将 Vitamin 工具暴露为 MCP Server。

## 设计原则

- **协议标准**：实现 MCP 2024-11-05 规范（JSON-RPC 2.0，initialize 握手，tools/resources/prompts）
- **传输抽象**：stdio（子进程）与 SSE（HTTP）双模式，通过 `McpTransport` 接口统一
- **工具适配**：将 MCP 外部工具转为 `@vitamin/agent` 的 `AgentTool` 格式，无缝接入 vitamin 生态
- **多 Server 管理**：通过 `McpManager` 管理多个 MCP Server 的生命周期、工具聚合和事件
- **双向 MCP**：不仅消费外部 MCP Server，也可将 vitamin 工具暴露给外部客户端

## 模块划分

| 模块 | 职责 |
|------|------|
| `types.ts` | MCP 协议类型定义 |
| `transport.ts` | 传输层（stdio / SSE） |
| `mcp-client.ts` | 单 server 连接和 JSON-RPC 交互 |
| `mcp-manager.ts` | 多 server 生命周期管理和聚合 |
| `mcp-tool-adapter.ts` | MCP tool → AgentTool 适配（JSON Schema → Zod） |
| `mcp-resource.ts` | MCP resource 查询和读取辅助 |
| `mcp-server.ts` | 将 vitamin 工具暴露为 MCP Server |

## 使用示例

### 连接 MCP Server 并获取工具

```ts
import { createMcpManager } from '@vitamin/mcp'

const manager = createMcpManager({ requestTimeoutMs: 30000 })

await manager.connectAll({
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  },
  github: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! },
  },
})

// 获取所有 MCP 工具（已转换为 AgentTool 格式）
const tools = manager.getAllTools()

// 获取所有资源
const resources = manager.getAllResources()
```

### 暴露 Vitamin 工具为 MCP Server

```ts
import { createMcpServer } from '@vitamin/mcp'

const server = createMcpServer(myTools, {
  name: 'vitamin-tools',
  version: '1.0.0',
})

await server.start() // 通过 stdin/stdout 通信
```

### 事件监听

```ts
manager.on('server.connected', ({ name, tools }) => {
  console.log(`${name} connected with ${tools} tools`)
})

manager.on('tools.changed', ({ serverName, tools }) => {
  console.log(`${serverName} tools updated: ${tools.length}`)
})
```

## 工具命名约定

MCP 工具在注入 vitamin 时使用 `mcp__{serverName}__{toolName}` 格式命名，以避免跨 server 冲突。

## 从 @vitamin/tools 迁移

此包从 `@vitamin/tools/src/mcp/` 提取并增强：
- 新增 `resources/list` / `resources/read` 支持
- 新增 `prompts/list` / `prompts/get` 支持
- 新增 `McpManager` 事件系统（`TypedEventEmitter<McpEvents>`）
- 新增 `VitaminMcpServer` 双向 MCP 支持
- 新增 `'reconnecting'` 客户端状态

## 主要导出

### 传输层

- `StdioTransport` — stdio 子进程传输（MCP stdio 模式）
- `SseTransport` — HTTP SSE 传输

### 客户端

- `McpClient`, `createMcpClient` — 单 Server 连接，支持 initialize 握手、tools/resources/prompts 列表与调用

### 管理器

- `McpManager`, `createMcpManager` — 多 Server 生命周期管理、工具聚合与事件

### 工具适配

- `createMcpToolAdapter` — 将单个 MCP 工具转换为 `AgentTool`
- `createMcpToolAdapters` — 批量转换
- `jsonSchemaPropertyToZod` — 将 `McpJsonSchemaProperty` 转换为 Zod schema
- `mcpSchemaToZod` — 将完整 `McpJsonSchema` 转换为 Zod record schema
- `mcpContentToToolContent` — 将 `McpContent` 转换为工具结果内容格式

### 资源查询

- `readMcpResource` — 读取单个 MCP 资源内容
- `findMcpResource` — 按 URI 查找资源
- `searchMcpResources` — 按关键词搜索资源列表

### Server

- `VitaminMcpServer`, `createMcpServer` — 将 vitamin 工具暴露为 MCP Server

### 类型

- Protocol 类型：`McpServerCapabilities`, `McpClientCapabilities`, `McpInitializeParams/Result`
- Tool 类型：`McpToolDefinition`, `McpJsonSchema`, `McpToolCallParams/Result`, `McpContent`
- Resource 类型：`McpResource`, `McpResourceEntry`, `McpResourceTemplate`, `McpResourceContents`
- Config 类型：`McpServerConfig`, `McpTransportType`, `McpClientStatus`, `McpServerInfo`, `McpEvents`
