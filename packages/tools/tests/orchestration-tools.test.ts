import { describe, expect, it } from 'vitest'

import { createAgentCall } from '../src/orchestration/agent-call'
import { createBackgroundCancelTool } from '../src/orchestration/background-task-cancel'
import { createBackgroundOutputTool } from '../src/orchestration/background-task-output'
import { createTaskCreate } from '../src/orchestration/task-create'
import { createTaskGet } from '../src/orchestration/task-get'
import { createTaskList } from '../src/orchestration/task-list'
import { createTaskUpdate } from '../src/orchestration/task-update'

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
    const tool = createAgentCall('/tmp', undefined as unknown as (agent: string, prompt: string) => Promise<{ success: boolean }>)

    await expect(tool.execute({
      id: 'ac3',
      params: { agent: 'explore', prompt: 'hello' },
      signal,
    })).rejects.toThrow('call_agent function is not provided in options')
  })
})
