import { describe, expect, it } from 'vitest'
import { routeSessionEvent } from '../src/session-event-router'

describe('routeSessionEvent', () => {
  it('routes tool execution events to websocket messages', () => {
    const messages = routeSessionEvent({
      type: 'tool_execution_event',
      sessionId: 's1',
      event: {
        type: 'progress',
        toolCallId: 'tc1',
        toolName: 'bash',
        update: 'running tests',
        timestamp: 123,
      },
    })

    expect(messages).toEqual([
      {
        type: 'Chat.toolExecutionEvent',
        data: {
          sessionId: 's1',
          event: {
            type: 'progress',
            toolCallId: 'tc1',
            toolName: 'bash',
            update: 'running tests',
            timestamp: 123,
          },
        },
      },
    ])
  })

  it('routes plugin command diagnostics to websocket messages', () => {
    const diagnostic = {
      kind: 'plugin-command' as const,
      pluginId: 'deploy-plugin',
      commandName: 'deploy',
      stage: 'permission' as const,
      status: 'denied' as const,
      permission: 'shell',
      effect: 'deny' as const,
      reason: 'blocked by policy',
    }

    const messages = routeSessionEvent({
      type: 'plugin_command_diagnostic',
      sessionId: 's1',
      diagnostic,
    })

    expect(messages).toEqual([
      {
        type: 'Plugin.commandDiagnostic',
        data: {
          sessionId: 's1',
          diagnostic,
        },
      },
    ])
  })

  it('routes patch review events to websocket messages', () => {
    const review = {
      id: 'tc1:patch-review',
      reviewType: 'patch' as const,
      toolCallId: 'tc1',
      toolName: 'write',
      risk: 'high' as const,
      targets: ['package.json'],
      blocked: true,
      reasons: ['high-risk target: package.json'],
    }

    expect(
      routeSessionEvent({
        type: 'review_requested',
        sessionId: 's1',
        review,
      }),
    ).toEqual([
      {
        type: 'Chat.reviewRequested',
        data: { sessionId: 's1', review },
      },
    ])

    expect(
      routeSessionEvent({
        type: 'review_failed',
        sessionId: 's1',
        review,
        issues: ['high-risk target: package.json'],
      }),
    ).toEqual([
      {
        type: 'Chat.reviewFailed',
        data: {
          sessionId: 's1',
          review,
          issues: ['high-risk target: package.json'],
        },
      },
    ])
  })
})
