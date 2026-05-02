import { describe, expect, it } from 'vitest'
import { TaskStore } from '../src/task-store'

describe('TaskStore', () => {
  it('creates a task with pending status and assigned id', async () => {
    const store = new TaskStore()
    const task = await store.create({ prompt: 'Fix the bug', subagent: 'coder' })

    expect(task.id).toMatch(/^task_/)
    expect(task.status).toBe('pending')
    expect(task.attempts).toBe(0)
    expect(task.sessionPolicy).toBe('ephemeral')
    expect(task.input.prompt).toBe('Fix the bug')
    expect(task.input.subagent).toBe('coder')
    expect(task.createdAt).toBeGreaterThan(0)
  })

  it('respects sessionMode from input', async () => {
    const store = new TaskStore()
    const task = await store.create({ prompt: 'Explore', sessionMode: 'sticky' })
    expect(task.sessionPolicy).toBe('sticky')
  })

  it('stores parent task id for sidechain children', async () => {
    const store = new TaskStore()
    const child = await store.create({ prompt: 'child', parentTaskId: 'task-parent' })
    expect(child.parentId).toBe('task-parent')
  })

  it('gets a task by id', async () => {
    const store = new TaskStore()
    const created = await store.create({ prompt: 'hello' })
    const fetched = await store.get(created.id)
    expect(fetched).toEqual(created)
  })

  it('returns undefined for unknown id', async () => {
    const store = new TaskStore()
    expect(await store.get('nonexistent')).toBeUndefined()
  })

  it('lists all tasks', async () => {
    const store = new TaskStore()
    await store.create({ prompt: 'a' })
    await store.create({ prompt: 'b' })
    const all = await store.list()
    expect(all).toHaveLength(2)
  })

  it('filters by status', async () => {
    const store = new TaskStore()
    const t1 = await store.create({ prompt: 'a' })
    await store.create({ prompt: 'b' })
    await store.update(t1.id, { status: 'running' })

    const running = await store.list({ status: 'running' })
    expect(running).toHaveLength(1)
    expect(running[0].id).toBe(t1.id)
  })

  it('filters by parentId', async () => {
    const store = new TaskStore()
    const parent = await store.create({ prompt: 'parent' })
    const child = await store.create({ prompt: 'child' })
    const fetched = await store.get(child.id)
    if (fetched) {
      fetched.parentId = parent.id
    }

    const children = await store.list({ parentId: parent.id })
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe(child.id)
  })

  it('updates task fields', async () => {
    const store = new TaskStore()
    const task = await store.create({ prompt: 'work' })

    await store.update(task.id, {
      status: 'completed',
      output: { text: 'done', durationMs: 1234 },
      completedAt: Date.now(),
    })

    const updated = await store.get(task.id)
    expect(updated?.status).toBe('completed')
    expect(updated?.output?.text).toBe('done')
    expect(updated?.completedAt).toBeGreaterThan(0)
  })

  it('throws when updating nonexistent task', async () => {
    const store = new TaskStore()
    await expect(store.update('nope', { status: 'failed' })).rejects.toThrow('Task not found: nope')
  })

  it('deletes a task', async () => {
    const store = new TaskStore()
    const task = await store.create({ prompt: 'to delete' })
    const deleted = await store.delete(task.id)
    expect(deleted).toBe(true)
    expect(await store.get(task.id)).toBeUndefined()
  })

  it('returns false when deleting nonexistent task', async () => {
    const store = new TaskStore()
    expect(await store.delete('ghost')).toBe(false)
  })
})
