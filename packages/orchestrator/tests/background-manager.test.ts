// BackgroundManager 单元测试
import { describe, expect, it } from 'vitest'

import { BackgroundManager, createBackgroundManager } from '../src/background/background-manager'
import type { AgentResult } from '../src/types'

function createMockResult(output = 'done'): AgentResult {
  return {
    messages: [],
    output,
    usage: { inputTokens: 10, outputTokens: 20 },
  }
}

describe('BackgroundManager', () => {
  describe('#given a fresh manager', () => {
    describe('#when submitting a task', () => {
      it('#then returns a handle with pending/running status', async () => {
        const manager = createBackgroundManager()
        let resolveTask!: (result: AgentResult) => void
        const execute = () => new Promise<AgentResult>((res) => { resolveTask = res })

        const handle = await manager.submit('t1', execute)

        expect(handle.taskId).toBe('t1')
        expect(['pending', 'running']).toContain(handle.getStatus())

        resolveTask(createMockResult())
        const result = await handle.getResult()
        expect(result.output).toBe('done')
        expect(handle.getStatus()).toBe('completed')
      })
    })

    describe('#when task completes', () => {
      it('#then status transitions to completed', async () => {
        const manager = createBackgroundManager()
        const handle = await manager.submit('t1', () => Promise.resolve(createMockResult('ok')))

        const result = await handle.getResult()
        expect(result.output).toBe('ok')
        expect(handle.getStatus()).toBe('completed')
      })
    })

    describe('#when task fails', () => {
      it('#then status transitions to error', async () => {
        const manager = createBackgroundManager()
        const handle = await manager.submit('t1', () => Promise.reject(new Error('boom')))

        await expect(handle.getResult()).rejects.toThrow('boom')
        expect(handle.getStatus()).toBe('error')
      })
    })

    describe('#when task is cancelled', () => {
      it('#then status transitions to cancelled', async () => {
        const manager = createBackgroundManager()
        const execute = () => new Promise<AgentResult>(() => {})

        const handle = await manager.submit('t1', execute)
        handle.cancel()

        expect(handle.getStatus()).toBe('cancelled')
        await expect(handle.getResult()).rejects.toThrow('Task cancelled')
      })
    })
  })

  describe('#given concurrency limit of 2', () => {
    describe('#when 3 tasks are submitted', () => {
      it('#then third task is queued', async () => {
        const manager = createBackgroundManager({ maxConcurrentPerKey: 2 })
        const resolvers: Array<(result: AgentResult) => void> = []

        const createTask = () => new Promise<AgentResult>((res) => { resolvers.push(res) })

        await manager.submit('t1', createTask, 'key')
        await manager.submit('t2', createTask, 'key')
        await manager.submit('t3', createTask, 'key')

        expect(manager.getRunningCount('key')).toBe(2)
        expect(manager.getQueuedCount('key')).toBe(1)

        // 完成第一个任务，第三个应该自动开始
        resolvers[0]!(createMockResult())
        // 让事件循环处理
        await new Promise((r) => setTimeout(r, 10))

        expect(manager.getRunningCount('key')).toBe(2)
        expect(manager.getQueuedCount('key')).toBe(0)

        // 完成后续任务
        resolvers[1]!(createMockResult())
        resolvers[2]!(createMockResult())
        await new Promise((r) => setTimeout(r, 10))

        expect(manager.getRunningCount('key')).toBe(0)
      })
    })
  })

  describe('#given multiple tasks', () => {
    describe('#when cancelAll is called', () => {
      it('#then all tasks are cancelled', async () => {
        const manager = createBackgroundManager()
        const handles = await Promise.all([
          manager.submit('t1', () => new Promise<AgentResult>(() => {})),
          manager.submit('t2', () => new Promise<AgentResult>(() => {})),
        ])

        // 先挂载 catch 防止 unhandled rejection
        const rejections = handles.map((h) => h.getResult().catch(() => {}))

        manager.cancelAll()

        for (const handle of handles) {
          expect(handle.getStatus()).toBe('cancelled')
        }

        await Promise.all(rejections)
      })
    })
  })

  describe('#given a task', () => {
    describe('#when getTask is called', () => {
      it('#then returns a handle for the task', async () => {
        const manager = createBackgroundManager()
        await manager.submit('t1', () => Promise.resolve(createMockResult()))

        const handle = manager.getTask('t1')
        expect(handle).toBeDefined()
        expect(handle!.taskId).toBe('t1')
      })

      it('#then returns undefined for unknown task', () => {
        const manager = createBackgroundManager()
        expect(manager.getTask('nonexistent')).toBeUndefined()
      })
    })
  })
})
