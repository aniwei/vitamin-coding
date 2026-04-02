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
