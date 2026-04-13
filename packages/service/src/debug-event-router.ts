/**
 * 与 session-event-router.ts 对称，集中管理 devtools → 前端的消息格式。
 * Log 事件因需要解析 pino 格式、维护历史缓存，由 DebugBridge 自身处理。
 */

import type { WebSocketMessage } from './types'

export function routeDebugEvent(event: Record<string, unknown>): WebSocketMessage[] {
  switch (event.type) {
    case 'Debugger.paused':
      return [
        {
          type: 'Debugger.paused',
          data: {
            reason: 'breakpoint',
            pauseId: event.pauseId as string,
            point: (event.snapshot as Record<string, unknown>)?.point,
            snapshot: event.snapshot as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          },
        },
      ]

    case 'Debugger.resumed':
      return [
        {
          type: 'Debugger.resumed',
          data: {
            pauseId: event.pauseId as string,
            command: event.command,
            timestamp: new Date().toISOString(),
          },
        },
      ]

    case 'Debugger.commandRejected':
      return [
        {
          type: 'Debugger.commandRejected',
          data: {
            code: event.code as string,
            pauseId: event.pauseId as string | undefined,
            command: event.command,
            timestamp: new Date().toISOString(),
          },
        },
      ]

    default:
      return []
  }
}
