import { describe, expect, it } from 'vitest'
import {
  isValidWebSocketMessage,
  validateWebSocketMessage,
  type WebSocketMessage,
} from '../src'

describe('websocket protocol validation', () => {
  it('#accepts valid runtime connection state messages', () => {
    const message: WebSocketMessage = {
      type: 'Runtime.connectionState',
      data: {
        status: 'connected',
        timestamp: '2026-05-02T10:00:00.000Z',
        queuedCommands: 0,
      },
    }

    expect(validateWebSocketMessage(message)).toEqual({ valid: true })
    expect(isValidWebSocketMessage(message)).toBe(true)
  })

  it('#rejects unknown message types and missing fields', () => {
    expect(validateWebSocketMessage({ type: 'Unknown.event', data: {} })).toEqual({
      valid: false,
      reason: 'unknown message type: Unknown.event',
    })
    expect(validateWebSocketMessage({ type: 'Runtime.error', data: {} })).toEqual({
      valid: false,
      reason: 'missing data.message',
    })
  })

  it('#validates tool execution and patch review payloads', () => {
    expect(
      validateWebSocketMessage({
        type: 'Chat.toolExecutionEvent',
        data: {
          sessionId: 's1',
          event: {
            type: 'started',
            toolCallId: 't1',
            toolName: 'read_file',
            args: {},
            timestamp: 1,
          },
        },
      }),
    ).toEqual({ valid: true })

    expect(
      validateWebSocketMessage({
        type: 'Plugin.commandDiagnostic',
        data: {
          sessionId: 's1',
          diagnostic: {
            kind: 'plugin-command',
            pluginId: 'deploy-plugin',
            commandName: 'deploy',
            stage: 'permission',
            status: 'denied',
          },
        },
      }),
    ).toEqual({ valid: true })

    expect(
      validateWebSocketMessage({
        type: 'Chat.reviewFailed',
        data: {
          sessionId: 's1',
          issues: ['missing test'],
          review: {
            id: 'r1',
            reviewType: 'patch',
            toolCallId: 't1',
            toolName: 'edit_file',
            risk: 'medium',
            targets: ['a.ts'],
            blocked: true,
            reasons: ['touches runtime'],
          },
        },
      }),
    ).toEqual({ valid: true })

    expect(
      validateWebSocketMessage({
        type: 'Chat.reviewFailed',
        data: {
          sessionId: 's1',
          issues: 'missing test',
          review: {
            id: 'r1',
            reviewType: 'patch',
            toolCallId: 't1',
            toolName: 'edit_file',
            risk: 'medium',
            targets: ['a.ts'],
            blocked: true,
            reasons: ['touches runtime'],
          },
        },
      }),
    ).toEqual({ valid: false, reason: 'data.issues must be an array' })
  })
})
