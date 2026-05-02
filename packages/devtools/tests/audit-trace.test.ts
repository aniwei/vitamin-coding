import { describe, expect, it } from 'vitest'

import {
  AuditTraceRecorder,
  replayAuditTrace,
  type AuditTrace,
} from '../src/audit-trace'

describe('AuditTraceRecorder', () => {
  it('records debug, tool, permission, plugin command, and model events with redaction', () => {
    let now = 1000
    const recorder = new AuditTraceRecorder({
      id: 'trace-test',
      clock: () => now++,
      metadata: { token: 'secret', scenario: 'unit' },
    })

    recorder.recordSnapshot({
      turn: 1,
      point: 'tool_before',
      frameDepth: 0,
      messagesCount: 2,
    }, 's1')
    recorder.recordToolExecution({
      type: 'started',
      toolName: 'bash',
      args: { command: 'echo ok', authorization: 'Bearer secret' },
    }, 's1')
    recorder.recordPermissionDecision({
      toolName: 'bash',
      decision: { effect: 'deny', ruleName: 'deny-test' },
    }, 's1')
    recorder.recordPluginCommand({
      kind: 'plugin-command',
      pluginId: 'deploy-plugin',
      commandName: 'deploy',
      stage: 'handler',
      status: 'failed',
      token: 'secret',
    }, 's1')
    recorder.recordModelResponse({
      model: 'test-model',
      apiKey: 'secret',
      text: 'done',
    }, 's1')

    const trace = recorder.export()

    expect(trace).toMatchObject({
      version: 1,
      id: 'trace-test',
      createdAt: 1000,
      metadata: { token: '[REDACTED]', scenario: 'unit' },
    })
    expect(trace.events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5])
    expect(trace.events[1]!.payload).toEqual({
      type: 'started',
      toolName: 'bash',
      args: { command: 'echo ok', authorization: '[REDACTED]' },
    })
    expect(trace.events[3]!.type).toBe('plugin.command')
    expect(trace.events[3]!.payload.token).toBe('[REDACTED]')
    expect(trace.events[4]!.payload.apiKey).toBe('[REDACTED]')
  })

  it('keeps only the newest maxEvents entries', () => {
    const recorder = new AuditTraceRecorder({ maxEvents: 2, clock: () => 1 })

    recorder.recordToolExecution({ toolName: 'read' })
    recorder.recordToolExecution({ toolName: 'write' })
    recorder.recordToolExecution({ toolName: 'bash' })

    expect(recorder.export().events.map((event) => event.payload.toolName)).toEqual([
      'write',
      'bash',
    ])
  })
})

describe('replayAuditTrace', () => {
  it('passes when required events are present', () => {
    const trace: AuditTrace = {
      version: 1,
      id: 'trace-replay',
      createdAt: 1,
      metadata: {},
      events: [
        {
          seq: 1,
          timestamp: 1,
          type: 'debug.snapshot',
          payload: { point: 'tool_before' },
        },
        {
          seq: 2,
          timestamp: 2,
          type: 'tool.execution',
          payload: { toolName: 'bash' },
        },
        {
          seq: 3,
          timestamp: 3,
          type: 'permission.decision',
          payload: { decision: { effect: 'deny' } },
        },
        {
          seq: 4,
          timestamp: 4,
          type: 'plugin.command',
          payload: { kind: 'plugin-command', commandName: 'deploy', stage: 'handler' },
        },
      ],
    }

    const result = replayAuditTrace(trace, {
      minEvents: 4,
      eventTypes: ['debug.snapshot', 'tool.execution', 'permission.decision', 'plugin.command'],
      permissionEffects: ['deny'],
      toolNames: ['bash'],
    })

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.summary.byType['tool.execution']).toBe(1)
    expect(result.summary.permissionEffects.deny).toBe(1)
  })

  it('reports replay mismatches and non-monotonic sequence numbers', () => {
    const trace: AuditTrace = {
      version: 1,
      id: 'trace-bad',
      createdAt: 1,
      metadata: {},
      events: [
        {
          seq: 2,
          timestamp: 1,
          type: 'tool.execution',
          payload: { toolName: 'read' },
        },
        {
          seq: 2,
          timestamp: 2,
          type: 'permission.decision',
          payload: { decision: { effect: 'allow' } },
        },
      ],
    }

    const result = replayAuditTrace(trace, {
      eventTypes: ['model.response'],
      permissionEffects: ['deny'],
      toolNames: ['bash'],
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([
      'Event sequence is not strictly increasing at index 1',
      'Missing event type: model.response',
      'Missing permission effect: deny',
      'Missing tool execution: bash',
    ])
  })
})
