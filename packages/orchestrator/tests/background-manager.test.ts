import { describe, expect, it } from 'vitest'
import { TaskStore } from '../src/task-store'
import { BackgroundManager } from '../src/background-manager'

describe('BackgroundManager.getOutput', () => {
  it('returns not_found for unknown task', async () => {
    const mgr = new BackgroundManager(new TaskStore())

    const result = await mgr.getOutput('nonexistent')
    expect(result.success).toBe(false)
    expect(result.status).toBe('not_found')
  })

  it('returns status for pending task', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    const mgr = new BackgroundManager(taskStore)

    const result = await mgr.getOutput(task.id)
    expect(result.success).toBe(true)
    expect(result.status).toBe('pending')
  })

  it('returns output for completed task', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    await taskStore.update(task.id, {
      status: 'completed',
      output: { text: 'result text', durationMs: 100 },
    })
    const mgr = new BackgroundManager(taskStore)

    const result = await mgr.getOutput(task.id)
    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.output).toBe('result text')
  })

  it('returns error for failed task', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    await taskStore.update(task.id, {
      status: 'failed',
      error: { code: 'FAIL', message: 'something broke', retriable: false },
    })
    const mgr = new BackgroundManager(taskStore)

    const result = await mgr.getOutput(task.id)
    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('something broke')
  })
})

describe('BackgroundManager.cancel', () => {
  it('returns error for unknown task', async () => {
    const mgr = new BackgroundManager(new TaskStore())

    const result = await mgr.cancel('nonexistent')
    expect(result.success).toBe(false)
  })

  it('cancels a pending task', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    const mgr = new BackgroundManager(taskStore)

    const result = await mgr.cancel(task.id)
    expect(result.success).toBe(true)

    const updated = await taskStore.get(task.id)
    expect(updated!.status).toBe('cancelled')
  })

  it('cancels a running task', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    await taskStore.update(task.id, { status: 'running' })
    const mgr = new BackgroundManager(taskStore)

    const result = await mgr.cancel(task.id)
    expect(result.success).toBe(true)

    const updated = await taskStore.get(task.id)
    expect(updated!.status).toBe('cancelled')
  })

  it('rejects cancel for completed task', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    await taskStore.update(task.id, { status: 'completed' })
    const mgr = new BackgroundManager(taskStore)

    const result = await mgr.cancel(task.id)
    expect(result.success).toBe(false)
    expect(result.error).toContain('terminal state')
  })

  it('calls abortTask when provided', async () => {
    const taskStore = new TaskStore()
    const task = await taskStore.create({ prompt: 'test' })
    await taskStore.update(task.id, { status: 'running' })
    const aborted: string[] = []
    const mgr = new BackgroundManager(taskStore, (id) => { aborted.push(id) })

    await mgr.cancel(task.id)
    expect(aborted).toEqual([task.id])
  })
})
