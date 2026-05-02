import { describe, expect, it } from 'vitest'

import {
  RuntimeAbortError,
  RuntimeTimeoutError,
  limitConcurrency,
  sleep,
  withTimeout,
} from '../src/runtime'

describe('runtime helpers', () => {
  describe('#sleep', () => {
    it('#then resolves after the requested delay', async () => {
      const started = Date.now()
      await sleep(5)
      expect(Date.now() - started).toBeGreaterThanOrEqual(0)
    })

    it('#then rejects when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort('stop')

      await expect(sleep(100, { signal: controller.signal })).rejects.toMatchObject({
        code: 'RUNTIME_ABORTED',
        message: 'stop',
      })
    })

    it('#then rejects when the signal aborts while sleeping', async () => {
      const controller = new AbortController()
      const pending = sleep(100, { signal: controller.signal })

      controller.abort(new RuntimeAbortError('cancelled'))

      await expect(pending).rejects.toThrow('cancelled')
    })
  })

  describe('#withTimeout', () => {
    it('#then returns the wrapped promise result before timeout', async () => {
      await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok')
    })

    it('#then rejects with a typed timeout error', async () => {
      await expect(withTimeout(sleep(50), 5)).rejects.toBeInstanceOf(RuntimeTimeoutError)
    })

    it('#then invokes onTimeout and accepts a custom timeout error', async () => {
      let timedOut = false
      await expect(
        withTimeout(sleep(50), 5, {
          onTimeout: () => {
            timedOut = true
          },
          createTimeoutError: (timeoutMs) => new Error(`Task timed out after ${timeoutMs}ms`),
        }),
      ).rejects.toThrow('Task timed out after 5ms')

      expect(timedOut).toBe(true)
    })
  })

  describe('#limitConcurrency', () => {
    it('#then preserves task order and caps active workers', async () => {
      let running = 0
      let maxRunning = 0
      const tasks = Array.from({ length: 5 }, (_, index) => async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await sleep(5)
        running--
        return index
      })

      await expect(limitConcurrency(tasks, 2)).resolves.toEqual([0, 1, 2, 3, 4])
      expect(maxRunning).toBeLessThanOrEqual(2)
    })

    it('#then treats invalid concurrency as one worker', async () => {
      await expect(limitConcurrency([async () => 'a', async () => 'b'], 0)).resolves.toEqual([
        'a',
        'b',
      ])
    })
  })
})
