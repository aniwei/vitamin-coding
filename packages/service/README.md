# @vitamin/service

基于 Hono 的 HTTP + WebSocket 服务层，将 `@vitamin/coding` 的 `VitaminApp` 和 `AgentSession` 暴露为 Web 服务。

## 安装

```bash
pnpm add @vitamin/service
```

## 核心概念

- **CodingService** — HTTP/WebSocket 服务容器，基于 Hono + Node HTTP Server
- **WebSocketManager** — WebSocket 连接管理，支持 CDP 风格的消息协议
- **EventBridge** — 将 `AgentSession` 事件桥接为 WebSocket 消息
- **DebugBridge** — 可选的调试桥接，连接 `@vitamin/devtools`

## 快速开始

```typescript
import { createVitamin } from '@vitamin/coding'
import { createCodingService } from '@vitamin/service'

const vitamin = await createVitamin({ /* ... */ })
await vitamin.start()

const service = createCodingService(vitamin.context, {
  port: 3000,
  host: '0.0.0.0',
  cors: true,
})

await service.start()
```

## HTTP 端点

| 路径 | 说明 |
|------|------|
| `/api/health` | 健康检查 |
| `/api/chat` | 聊天/查询 |
| `/api/sessions` | Session 管理 |
| `/api/setting` | 配置管理 |
| `/api/debug` | 调试命令（需启用 devtools） |
| `/api/logs` | 日志访问 |
| `/ws` | WebSocket 升级（CDP 风格协议） |
| `/*` | 静态文件服务（需配置 `staticDir`） |

## WebSocket 协议

### 客户端 → 服务端

- `Runtime.ping` — 心跳
- `Chat.query` — 发起聊天
- `Chat.approval` / `Chat.askUserResponse` / `Chat.planApprovalResponse` — 交互响应
- `Session.subscribe` / `Session.unsubscribe` — 会话订阅
- `Debugger.resume` / `Debugger.stepOver` / `Debugger.setBreakpoint` — 调试控制
- `Log.enable` / `Log.disable` / `Log.clear` — 日志控制

### 服务端 → 客户端

Chat 事件、Session 更新、Debugger 事件（`Debugger.paused`）、运行时错误（`Runtime.error`）、日志条目。

## Key Exports

| Export | Description |
|--------|-------------|
| `CodingService` | HTTP/WS 服务类 |
| `createCodingService` | 工厂函数 |
| `WebSocketManager` | WebSocket 连接管理器 |
| `EventBridge` | 会话事件桥接器 |
| `DebugBridge` | 调试桥接器 |

## Types

`CodingServiceOptions`, `WebSocketMessage`, `WebSocketEventType`, `WebSocketClientMessage`, `WebSocketClientMessageType`, `EventBridgeMapper`, `LogEntry`

## License

See [root README](../../README.md) for details.
