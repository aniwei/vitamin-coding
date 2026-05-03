import { describe, expect, it } from 'vitest'

import { createAgentCall, createReviewCall } from '../src/orchestration/agent-call'
import { createAgentCancel } from '../src/orchestration/agent-cancel'
import { createAgentList } from '../src/orchestration/agent-list'
import { createAgentTask } from '../src/orchestration/agent-task'
import { createBackgroundCancelTool } from '../src/orchestration/background-task-cancel'
import { createBackgroundOutputTool } from '../src/orchestration/background-task-output'
import { createTaskCreate } from '../src/orchestration/task-create'
import { createTaskGet } from '../src/orchestration/task-get'
import { createTaskList } from '../src/orchestration/task-list'
import { createTaskUpdate } from '../src/orchestration/task-update'
import { createWriteTodos } from '../src/orchestration/write-todos'

describe('orchestration tools (additional coverage)', () => {
  const signal = new AbortController().signal

  it('task_create succeeds and returns created id', async () => {
    const tool = createTaskCreate('/tmp', async () => ({
      id: 'task-1',
      success: true,
    }))

    const result = await tool.execute({
      id: 'tc1',
      params: { prompt: 'do something', category: 'search', subagent: 'explore' },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect((result.content[0] as { text: string })?.text).toContain('Task created: task-1')
  })

  it('task_create throws when callback returns failure', async () => {
    const tool = createTaskCreate('/tmp', async () => ({
      id: 'task-2',
      success: false,
      error: 'create failed',
    }))

    const result = await tool.execute({
      id: 'tc2',
      params: { prompt: 'do something' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string })?.text).toContain('create failed')
  })

  it('task_get returns not found with isError when callback returns undefined task', async () => {
    const tool = createTaskGet('/tmp', {
      get: async () => undefined as unknown as { id: string; status: string },
    })

    const result = await tool.execute({
      id: 'tg1',
      params: { id: 'missing' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string })?.text).toContain('Task missing not found')
  })

  it('task_get returns formatted status message on non-error task payload', async () => {
    const tool = createTaskGet('/tmp', {
      get: async () => ({ id: 't1', status: 'running', output: 'halfway' }),
    })

    const result = await tool.execute({
      id: 'tg2',
      params: { id: 't1' },
      signal,
    })

    expect(result.isError).toBe(false)
    const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
    expect(text).toContain('Task: t1')
    expect(text).toContain('Status: running')
  })

  it('task_list returns list text when callback succeeds', async () => {
    const tool = createTaskList('/tmp', {
      list: async () => ({
        success: true,
        tasks: [
          { id: 'a', prompt: 'task A', status: 'pending' },
          { id: 'b', prompt: 'task B', status: 'running' },
        ],
      }),
    })

    const result = await tool.execute({
      id: 'tl1',
      params: { status: 'all' },
      signal,
    })

    expect(result.isError).toBeUndefined()
    const text = (result.content[0] as { text: string })?.text ?? ''
    expect(text).toContain('[pending] a')
    expect(text).toContain('[running] b')
  })

  it('task_update returns isError when callback is missing', async () => {
    const tool = createTaskUpdate('/tmp', {})

    const result = await tool.execute({
      id: 'tu1',
      params: { id: 'x', action: 'cancel' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string })?.text).toContain('task_update not available')
  })

  it('task_update returns isError when callback returns failed result', async () => {
    const tool = createTaskUpdate('/tmp', {
      update: async () => ({ success: false, message: 'cannot update' }),
    })

    const result = await tool.execute({
      id: 'tu2',
      params: { id: 'x', action: 'retry' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('cannot update')
    }
  })

  it('background_output returns formatted status and output', async () => {
    const tool = createBackgroundOutputTool(async () => ({
      success: true,
      status: 'running',
      output: 'line1',
    }))

    const result = await tool.execute({
      id: 'bo1',
      params: { id: 'bg-1' },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect((result.content[0] as { text: string })?.text).toContain('Status: running')
    expect((result.content[0] as { text: string })?.text).toContain('line1')
  })

  it('background_cancel returns isError when cancel fails', async () => {
    const tool = createBackgroundCancelTool(async () => ({
      success: false,
      error: 'not found',
    }))

    const result = await tool.execute({
      id: 'bc1',
      params: { id: 'bg-2' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('not found')
    }
  })

  it('agent_call throws when callback is missing', async () => {
    const tool = createAgentCall(
      '/tmp',
      undefined as unknown as (agent: string, prompt: string) => Promise<{ success: boolean }>,
    )

    await expect(
      tool.execute({
        id: 'ac3',
        params: { agent: 'explore', prompt: 'hello' },
        signal,
      }),
    ).rejects.toThrow('call_agent function is not provided in options')
  })

  it('review_call throws when callback is missing', async () => {
    const tool = createReviewCall(
      '/tmp',
      undefined as unknown as (agent: string, prompt: string) => Promise<{ success: boolean }>,
    )

    await expect(
      tool.execute({
        id: 'rc3',
        params: { agent: 'reviewer', prompt: 'hello' },
        signal,
      }),
    ).rejects.toThrow('call_agent function is not provided in options')
  })

  it('agent_task returns isError when dispatch fails', async () => {
    const tool = createAgentTask('/tmp', async () => ({
      success: false,
      error: 'task runtime rejected request',
    }))

    const result = await tool.execute({
      id: 'at3',
      params: {
        agent: 'implementer',
        prompt: 'ship change',
      },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('task runtime rejected request')
    }
  })

  it('agent_task throws when dispatch callback is missing', async () => {
    const tool = createAgentTask(
      '/tmp',
      undefined as unknown as (args: {
        prompt?: string
        subagent?: string
        mode: 'sync' | 'background'
        sessionId?: string
        sessionMode?: 'ephemeral' | 'sticky'
        slot?: 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'
      }) => Promise<{ success: boolean }>,
    )

    await expect(
      tool.execute({
        id: 'at4',
        params: { agent: 'implementer', prompt: 'hello' },
        signal,
      }),
    ).rejects.toThrow('agent_task function is not provided in options')
  })

  it('agent_list formats available agents and filters disabled agents by default', async () => {
    const tool = createAgentList(async () => ({
      success: true,
      agents: [
        {
          name: 'explorer',
          description: 'Read-only code explorer',
          source: 'builtin',
          tools: ['read', 'grep'],
          capabilities: ['code-search'],
          activeTaskCount: 1,
          runningTaskIds: ['task-1'],
          lastTaskStatus: 'running',
        },
        {
          name: 'legacy',
          disabled: true,
          source: 'settings',
        },
      ],
    }))

    const result = await tool.execute({
      id: 'al1',
      params: {},
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('- explorer')
      expect(result.content[0].text).toContain('tools: read, grep')
      expect(result.content[0].text).toContain('activeTasks: 1')
      expect(result.content[0].text).toContain('runningTaskIds: task-1')
      expect(result.content[0].text).not.toContain('legacy')
    }
    expect(result.details).toMatchObject({
      agents: [{ name: 'explorer' }],
    })
  })

  it('agent_list can include disabled agents when requested', async () => {
    const tool = createAgentList(async () => ({
      success: true,
      agents: [{ name: 'legacy', disabled: true, source: 'settings' }],
    }))

    const result = await tool.execute({
      id: 'al2',
      params: { includeDisabled: true },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('- legacy (disabled)')
    }
    expect(result.details).toMatchObject({
      agents: [{ name: 'legacy', disabled: true }],
    })
  })

  it('agent_cancel returns cancelled and skipped task details', async () => {
    const tool = createAgentCancel(async (agent, options) => ({
      success: true,
      agent,
      cancelled: options?.includePending ? ['task-1', 'task-2'] : ['task-1'],
      skipped: [{ id: 'task-3', status: 'completed', reason: 'not active' }],
    }))

    const result = await tool.execute({
      id: 'acancel1',
      params: { agent: 'explorer', includePending: true },
      signal,
    })

    expect(result.isError).toBe(false)
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('Agent explorer cancel completed')
      expect(result.content[0].text).toContain('Cancelled: task-1, task-2')
      expect(result.content[0].text).toContain('task-3 (completed: not active)')
    }
    expect(result.details).toMatchObject({
      agent: 'explorer',
      cancelled: ['task-1', 'task-2'],
    })
  })

  it('write_todos passes sessionId through', async () => {
    let receivedSessionId: string | undefined

    const tool = createWriteTodos(async ({ todos, sessionId }) => {
      receivedSessionId = sessionId
      return {
        success: true,
        todos,
      }
    })

    const result = await tool.execute({
      id: 'wt1',
      params: {
        action: 'set',
        todos: [{ id: 'T1', title: 'Map todos to plan', status: 'pending' }],
      },
      signal,
      sessionId: 'lead-session-1',
    })

    expect(result.isError).toBeUndefined()
    expect(receivedSessionId).toBe('lead-session-1')
    expect(result.content[0]?.type).toBe('text')
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('[pending] T1: Map todos to plan')
    }
    expect(result.details).toEqual({
      todos: [{ id: 'T1', title: 'Map todos to plan', status: 'pending' }],
    })
  })
})
