# @vitamin/service

## 模块定位
提供 HTTP/WebSocket 服务封装与事件桥接。

## 当前状态（基于源码）
- 包目录：`packages/service`
- 源码文件数：13
- 测试文件数：0
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `coding-service.ts`
  - `create-app.ts`
  - `debug-bridge.ts`
  - `event-bridge.ts`
  - `index.ts`
  - `routes/`
  - `types.ts`
  - `websocket-manager.ts`
- 当前包无 `tests/` 目录或目录为空。

## 公开导出
```ts
export { CodingService, createCodingService } from './coding-service'
export { WebSocketManager } from './websocket-manager'
export { EventBridge } from './event-bridge'
export { DebugBridge } from './debug-bridge'
export type { LogEntry } from './debug-bridge'
export type { CodingServiceOptions, WebSocketMessage, WebSocketEventType, WebSocketClientMessage, WebSocketClientMessageType, EventBridgeMapper, } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/service build`
- `pnpm --filter @vitamin/service typecheck`
- `pnpm --filter @vitamin/service clean`

## 关联 Vitamin 包
- `@vitamin/ai`
- `@vitamin/coding`
- `@vitamin/devtools`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
