# @vitamin/service

## 模块定位

提供 Vitamin 的网络传输层：基于 Hono 的 HTTP API + WebSocket 实时通信 + 事件桥接。

## 核心功能

| 模块 | 功能 |
|------|------|
| CodingService | Hono HTTP 路由（health/chat/sessions/setting/debug/logs） |
| WebSocketManager | WebSocket 连接管理 + 会话订阅 + 广播 |
| EventBridge | AgentSession 事件 → WebSocket 协议映射（40+ 事件） |
| DebugBridge | 调试协议桥接到 HTTP/WebSocket |

## HTTP API

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/chat` | POST | 发送消息（SSE 流式响应） |
| `/api/sessions` | GET/POST | 会话列表/创建 |
| `/api/sessions/:id` | GET/DELETE | 单会话操作 |
| `/api/setting` | GET/PUT | 配置读写 |
| `/api/debug` | GET/POST | 调试操作 |

## 目录概览

```
src/
  types.ts               # 核心类型
  coding-service.ts      # Hono HTTP 路由
  websocket-manager.ts   # WebSocket 管理
  event-bridge.ts        # 事件桥接
  debug-bridge.ts        # 调试桥接
  index.ts
example/                 # 集成示例
```

## 开发命令

```bash
pnpm --filter @vitamin/service build
pnpm --filter @vitamin/service typecheck
pnpm --filter @vitamin/service clean
```

## 关联包

`@vitamin/coding`、`@vitamin/devtools`、`@vitamin/shared`、`@vitamin/env`
