import type { HookInput } from '@x-mars/hooks'
import type { WebSocketMessage } from './types'

type TaskEvent =
  | { timing: 'task.created'; payload: HookInput<'task.created'> }
  | { timing: 'task.started'; payload: HookInput<'task.started'> }
  | { timing: 'task.completed'; payload: HookInput<'task.completed'> }
  | { timing: 'task.failed'; payload: HookInput<'task.failed'> }
  | { timing: 'task.cancelled'; payload: HookInput<'task.cancelled'> }

const OUTPUT_TAIL_LIMIT = 1200

export function routeTaskEvent(event: TaskEvent): WebSocketMessage[] {
  const task = readRecord(event.payload, 'task')
  const sessionId = resolveParentSessionId(task)
  if (!sessionId) {
    return []
  }

  const taskId = readString(task, 'id') || readString(event.payload, 'taskId')
  if (!taskId) {
    return []
  }

  const input = readRecord(task, 'input')
  const sidechain = readRecord(task, 'sidechain')
  const agentName =
    readString(input, 'subagent') ||
    readString(sidechain, 'subagent') ||
    readString(event.payload, 'agent') ||
    'default'
  const childSessionId = readString(sidechain, 'childSessionId') || readString(task, 'sessionId')
  const taskPrompt = readString(input, 'prompt') || ''
  const description = readString(input, 'category') || taskPrompt

  switch (event.timing) {
    case 'task.created':
      return []

    case 'task.started':
      return [
        {
          type: 'Chat.subagentStart',
          data: {
            sessionId,
            agentName,
            subagentId: taskId,
            taskId,
            toolCallId: taskId,
            agentType: agentName,
            subagentName: agentName,
            task: taskPrompt,
            description,
          },
        },
      ]

    case 'task.completed': {
      const outputTail = resolveOutputTail(task, event.payload)
      const summary = resolveSummary(task, event.payload, outputTail)
      return [
        {
          type: 'Chat.subagentComplete',
          data: {
            sessionId,
            agentName,
            subagentId: taskId,
            taskId,
            toolCallId: taskId,
            success: true,
            summary,
            resultSummary: summary,
            outputTail,
            childSessionId,
          },
        },
        {
          type: 'Chat.taskCompleted',
          data: {
            sessionId,
            taskId,
            agentName,
            status: 'completed',
            summary,
            outputTail,
            childSessionId,
          },
        },
      ]
    }

    case 'task.failed': {
      const error = readRecord(event.payload, 'error')
      const summary =
        readString(error, 'message') ||
        readString(readRecord(task, 'sidechain'), 'summary') ||
        'Failed'
      return [
        {
          type: 'Chat.subagentComplete',
          data: {
            sessionId,
            agentName,
            subagentId: taskId,
            taskId,
            toolCallId: taskId,
            success: false,
            summary,
            resultSummary: summary,
            outputTail: summary,
            childSessionId,
          },
        },
        {
          type: 'Chat.taskCompleted',
          data: { sessionId, taskId, agentName, status: 'failed', summary, childSessionId },
        },
      ]
    }

    case 'task.cancelled':
      return [
        {
          type: 'Chat.subagentComplete',
          data: {
            sessionId,
            agentName,
            subagentId: taskId,
            taskId,
            toolCallId: taskId,
            success: false,
            summary: 'Cancelled',
            resultSummary: 'Cancelled',
            outputTail: 'Cancelled',
            childSessionId,
          },
        },
        {
          type: 'Chat.taskCompleted',
          data: {
            sessionId,
            taskId,
            agentName,
            status: 'cancelled',
            summary: 'Cancelled',
            childSessionId,
          },
        },
      ]
  }
}

function resolveParentSessionId(task: Record<string, unknown>): string | undefined {
  const input = readRecord(task, 'input')
  const sidechain = readRecord(task, 'sidechain')
  return (
    readString(sidechain, 'parentSessionId') ||
    readString(input, 'parentSessionId') ||
    readString(input, 'sessionId')
  )
}

function resolveSummary(
  task: Record<string, unknown>,
  payload: HookInput<'task.completed'>,
  fallback: string,
): string {
  const sidechain = readRecord(task, 'sidechain')
  const output = readRecord(task, 'output')
  const subagentResult = readRecord(payload, 'subagentResult')
  return (
    readString(subagentResult, 'summary') ||
    readString(sidechain, 'summary') ||
    readString(output, 'summary') ||
    fallback ||
    'Completed'
  )
}

function resolveOutputTail(
  task: Record<string, unknown>,
  payload: HookInput<'task.completed'>,
): string {
  const subagentResult = readRecord(payload, 'subagentResult')
  const output = readRecord(task, 'output')
  const sidechain = readRecord(task, 'sidechain')
  const text =
    readString(subagentResult, 'outputTail') ||
    readString(output, 'text') ||
    readString(sidechain, 'summary') ||
    readString(output, 'summary') ||
    ''
  return text.length > OUTPUT_TAIL_LIMIT ? text.slice(text.length - OUTPUT_TAIL_LIMIT) : text
}

function readRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
