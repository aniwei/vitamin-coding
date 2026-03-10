// execution-modes 覆盖率测试
import { describe, expect, it } from 'vitest'

import { executeSyncTask } from '../src/delegation/execution-modes'

import type { AgentResult } from '../src/types'

function makeAgentResult(output: string): AgentResult {
  return {
    messages: [],
    output,
    usage: { inputTokens: 0, outputTokens: 0 },
  }
}

describe('executeSyncTask', () => {
  describe('#given a successful execute function', () => {
    describe('#when awaiting result', () => {
      it('#then returns completed handle with result', async () => {
        const handle = await executeSyncTask('t-1', async () => makeAgentResult('done'))

        const result = await handle.getResult()
        expect(handle.taskId).toBe('t-1')
        expect(handle.status).toBe('completed')
        expect(handle.result).toBeDefined()
        expect(result.output).toBe('done')
      })
    })
  })

  describe('#given a failing execute function', () => {
    describe('#when error is thrown', () => {
      it('#then sets status to error and exposes error', async () => {
        const handle = await executeSyncTask('t-2', async () => {
          throw new Error('task failed')
        })

        // getResult() 返回的 promise 会被 reject，await 它来触发状态变更
        await handle.getResult().catch(() => {})

        expect(handle.status).toBe('error')
        expect(handle.error).toBeDefined()
        expect(handle.error?.message).toBe('task failed')
      })
    })
  })

  describe('#given a running task', () => {
    describe('#when cancel is called', () => {
      it('#then sets status to cancelled', async () => {
        let resolveTask!: (value: AgentResult) => void
        const promise = new Promise<AgentResult>((resolve) => {
          resolveTask = resolve
        })

        const handle = await executeSyncTask('t-3', () => promise)

        expect(handle.status).toBe('running')
        handle.cancel()
        expect(handle.status).toBe('cancelled')

        // 触发 Promise 完成防止 unhandled rejection
        resolveTask(makeAgentResult('late'))
      })
    })
  })

  describe('#given a completed task', () => {
    describe('#when cancel is called', () => {
      it('#then status remains completed', async () => {
        const handle = await executeSyncTask('t-4', async () => makeAgentResult('ok'))

        await handle.getResult()
        handle.cancel()
        expect(handle.status).toBe('completed')
      })
    })
  })

  describe('#given getStatus method', () => {
    describe('#when called', () => {
      it('#then returns same value as status getter', async () => {
        const handle = await executeSyncTask('t-5', async () => makeAgentResult('ok'))
        await handle.getResult()
        expect(handle.getStatus()).toBe(handle.status)
        expect(handle.getStatus()).toBe('completed')
      })
    })
  })
})
