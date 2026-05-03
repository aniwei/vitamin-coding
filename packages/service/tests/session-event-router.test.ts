import { describe, expect, it } from 'vitest'
import { routeSessionEvent } from '../src/session-event-router'
import { routeTaskEvent } from '../src/task-event-router'

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

describe('routeTaskEvent', () => {
  it('routes delegated task start events to subagent websocket messages', () => {
    const messages = routeTaskEvent({
      timing: 'task.started',
      payload: {
        agent: 'explorer',
        task: {
          id: 'task-1',
          status: 'running',
          input: {
            prompt: 'inspect files',
            subagent: 'explorer',
            parentSessionId: 'parent-1',
          },
        },
      },
    })

    expect(messages).toEqual([
      {
        type: 'Chat.subagentStart',
        data: {
          sessionId: 'parent-1',
          agentName: 'explorer',
          subagentId: 'task-1',
          taskId: 'task-1',
          toolCallId: 'task-1',
          agentType: 'explorer',
          subagentName: 'explorer',
          task: 'inspect files',
          description: 'inspect files',
        },
      },
    ])
  })

  it('routes delegated task completions with output tail and child session context', () => {
    const output = `${'x'.repeat(1300)}final summary`
    const messages = routeTaskEvent({
      timing: 'task.completed',
      payload: {
        task: {
          id: 'task-1',
          status: 'completed',
          sessionId: 'child-1',
          input: {
            prompt: 'inspect files',
            subagent: 'explorer',
            parentSessionId: 'parent-1',
          },
          output: {
            text: output,
            summary: 'done inspecting',
          },
          sidechain: {
            parentSessionId: 'parent-1',
            childSessionId: 'child-1',
            subagent: 'explorer',
            summary: 'done inspecting',
          },
        },
        result: { text: output, summary: 'done inspecting' },
      },
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      type: 'Chat.subagentComplete',
      data: {
        sessionId: 'parent-1',
        agentName: 'explorer',
        subagentId: 'task-1',
        success: true,
        summary: 'done inspecting',
        resultSummary: 'done inspecting',
        childSessionId: 'child-1',
      },
    })
    expect(messages[0]?.data.outputTail).toHaveLength(1200)
    expect(messages[0]?.data.outputTail).toContain('final summary')
    expect(messages[1]).toMatchObject({
      type: 'Chat.taskCompleted',
      data: {
        sessionId: 'parent-1',
        taskId: 'task-1',
        status: 'completed',
        outputTail: messages[0]?.data.outputTail,
      },
    })
  })

  it('routes delegated task failures with error summaries', () => {
    const messages = routeTaskEvent({
      timing: 'task.failed',
      payload: {
        task: {
          id: 'task-2',
          status: 'failed',
          input: {
            prompt: 'review patch',
            subagent: 'reviewer',
            parentSessionId: 'parent-1',
          },
          sidechain: {
            parentSessionId: 'parent-1',
            childSessionId: 'child-2',
            subagent: 'reviewer',
          },
        },
        error: { message: 'review failed' },
      },
    })

    expect(messages).toEqual([
      {
        type: 'Chat.subagentComplete',
        data: {
          sessionId: 'parent-1',
          agentName: 'reviewer',
          subagentId: 'task-2',
          taskId: 'task-2',
          toolCallId: 'task-2',
          success: false,
          summary: 'review failed',
          resultSummary: 'review failed',
          outputTail: 'review failed',
          childSessionId: 'child-2',
        },
      },
      {
        type: 'Chat.taskCompleted',
        data: {
          sessionId: 'parent-1',
          taskId: 'task-2',
          agentName: 'reviewer',
          status: 'failed',
          summary: 'review failed',
          childSessionId: 'child-2',
        },
      },
    ])
  })

  it('routes delegated task cancellations to the parent session', () => {
    const messages = routeTaskEvent({
      timing: 'task.cancelled',
      payload: {
        taskId: 'task-3',
        task: {
          id: 'task-3',
          status: 'cancelled',
          input: {
            prompt: 'slow task',
            subagent: 'explorer',
            parentSessionId: 'parent-1',
          },
        },
      },
    })

    expect(messages).toEqual([
      {
        type: 'Chat.subagentComplete',
        data: {
          sessionId: 'parent-1',
          agentName: 'explorer',
          subagentId: 'task-3',
          taskId: 'task-3',
          toolCallId: 'task-3',
          success: false,
          summary: 'Cancelled',
          resultSummary: 'Cancelled',
          outputTail: 'Cancelled',
          childSessionId: undefined,
        },
      },
      {
        type: 'Chat.taskCompleted',
        data: {
          sessionId: 'parent-1',
          taskId: 'task-3',
          agentName: 'explorer',
          status: 'cancelled',
          summary: 'Cancelled',
          childSessionId: undefined,
        },
      },
    ])
  })
})
