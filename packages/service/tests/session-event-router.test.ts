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
