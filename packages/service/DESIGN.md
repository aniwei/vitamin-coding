# @vitamin/service 设计说明

## 设计目标

- 提供 Vitamin 的网络传输层：HTTP API + WebSocket 实时通信。
- 基于 Hono 框架实现轻量级 RESTful 路由。
- 通过 EventBridge 将 AgentSession 事件映射到 WebSocket 协议。

## 非目标

- 不实现业务逻辑（由 `@vitamin/coding` 提供 VitaminApp 和 AgentSession）。
- 不负责前端渲染（由 `@vitamin/web-ui` 完成）。

## 实现原理

### CodingService（coding-service.ts）

核心服务类，基于 Hono HTTP 框架：

#### HTTP 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/chat` | POST | 发送消息（流式 SSE 响应） |
| `/api/sessions` | GET/POST/DELETE | 会话 CRUD |
| `/api/sessions/:id` | GET/PATCH | 单会话操作 |
| `/api/setting` | GET/PUT | 配置读写 |
| `/api/debug` | GET/POST | 调试相关 |
| `/api/logs` | GET | 日志查询 |

#### WebSocket

- 升级路由：`/ws`
- 客户端连接后可订阅指定 session 的事件流

### WebSocketManager（websocket-manager.ts）

管理 WebSocket 客户端连接：
- `handleConnection(ws)` → 注册客户端
- `subscribe(clientId, sessionId)` → 绑定客户端到会话
- `broadcast(sessionId, event)` → 向订阅会话的所有客户端广播
- `disconnect(clientId)` → 清理连接

### EventBridge（event-bridge.ts）

AgentSession 事件到 WebSocket 协议的单向映射（40+ 事件类型）：
- Agent 事件：`status_change` / `stream_event` / `tool_call_start` / `tool_call_end` / `messages_updated`
- Session 事件：`session:created` / `session:deleted`
- 系统事件：`error` / `abort`

每个事件映射为 JSON 消息结构：`{ type, sessionId, data, timestamp }`

### DebugBridge（debug-bridge.ts）

将 `@vitamin/devtools` 的调试协议桥接到 HTTP/WebSocket：
- `/api/debug/breakpoints` → 断点管理
- `/api/debug/snapshot` → 调试快照
- WebSocket debug 事件转发

## 实现流程

```
客户端 --> HTTP 请求 --> Hono 路由 --> 业务处理 --> JSON 响应
                                        |
                                   VitaminApp 方法调用
                                        |
客户端 --> WebSocket 连接 --> WebSocketManager
                                |
                          subscribe(session)
                                |
                          AgentSession 事件
                                |
                          EventBridge.map(event)
                                |
                          broadcast 到订阅客户端

聊天流程：
  POST /api/chat { sessionId, message }
       |
  app.getSession(sessionId).chat(message)
       |
  SSE 流式响应：
    event: stream_start
    event: stream_chunk { text }
    event: tool_call { name, args }
    event: stream_end { message }
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/types.ts` | ServiceConfig / WebSocketMessage 类型 |
| `src/coding-service.ts` | Hono HTTP 路由 + 启动 |
| `src/websocket-manager.ts` | WebSocket 连接管理 |
| `src/event-bridge.ts` | 事件 → WebSocket 映射 |
| `src/debug-bridge.ts` | 调试协议桥接 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/coding`、`@vitamin/devtools`、`@vitamin/shared`、`@vitamin/env`
- **外部依赖**：`hono`、`@hono/node-server`

## 测试策略

- 测试文件位于 `example/` 目录，以集成示例形式验证
