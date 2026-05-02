import { describe, expect, it } from 'vitest'
import { limitConcurrency } from '../src/concurrency'

describe('limitConcurrency', () => {
  describe('#given 5 tasks with max concurrency 2', () => {
    it('#then never runs more than 2 at once', async () => {
      let running = 0
      let maxRunning = 0

      const makeTask = (id: number) => async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise((r) => setTimeout(r, 10))
        running--
        return id
      }

      const tasks = [makeTask(0), makeTask(1), makeTask(2), makeTask(3), makeTask(4)]
      const results = await limitConcurrency(tasks, 2)

      expect(results).toEqual([0, 1, 2, 3, 4])
      expect(maxRunning).toBeLessThanOrEqual(2)
    })
  })

  describe('#given empty task list', () => {
    it('#then returns empty results', async () => {
      const results = await limitConcurrency([], 5)
      expect(results).toEqual([])
    })
  })

  describe('#given concurrency higher than task count', () => {
    it('#then runs all tasks', async () => {
      const tasks = [async () => 'a', async () => 'b']
      const results = await limitConcurrency(tasks, 10)
      expect(results).toEqual(['a', 'b'])
    })
  })
})
