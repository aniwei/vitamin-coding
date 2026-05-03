import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createFileSchedulerJobStore, createInMemorySchedulerJobStore, Scheduler } from '../src'

describe('scheduler', () => {
  it('creates interval jobs and dispatches due work on tick', async () => {
    let now = Date.UTC(2026, 0, 1, 0, 0, 0)
    const dispatched: string[] = []
    const parentSessionIds: Array<string | undefined> = []
    const scheduler = new Scheduler({
      store: createInMemorySchedulerJobStore(),
      now: () => now,
      dispatchTask: async (input) => {
        dispatched.push(input.prompt)
        parentSessionIds.push(input.parentSessionId)
        return { success: true, id: `task-${dispatched.length}` }
      },
    })

    const job = await scheduler.createJob({
      prompt: 'run report',
      schedule: 'every 5m',
      parentSessionId: 'parent-session',
    })
    expect(job.nextRunAt).toBe(now + 5 * 60_000)

    expect((await scheduler.tick({ now: now + 60_000 })).dispatched).toEqual([])

    now += 5 * 60_000
    const tick = await scheduler.tick()

    expect(tick.dispatched).toEqual([{ jobId: job.id, taskId: 'task-1', success: true }])
    expect(dispatched).toEqual(['run report'])
    expect(parentSessionIds).toEqual(['parent-session'])
    const updated = (await scheduler.listJobs())[0]
    expect(updated?.runCount).toBe(1)
    expect(updated?.nextRunAt).toBe(now + 5 * 60_000)
  })

  it('supports simple cron expressions', async () => {
    const now = new Date(2026, 0, 1, 8, 58, 30).getTime()
    const scheduler = new Scheduler({
      store: createInMemorySchedulerJobStore(),
      now: () => now,
      dispatchTask: async () => ({ success: true, id: 'task-1' }),
    })

    const job = await scheduler.createJob({ prompt: 'standup', schedule: '0 9 * * *' })
    const next = new Date(job.nextRunAt)

    expect(next.getHours()).toBe(9)
    expect(next.getMinutes()).toBe(0)
  })

  it('pauses after retry budget is exhausted', async () => {
    let now = Date.UTC(2026, 0, 1, 0, 0, 0)
    const scheduler = new Scheduler({
      store: createInMemorySchedulerJobStore(),
      now: () => now,
      dispatchTask: async () => ({ success: false, error: 'network down' }),
    })
    const job = await scheduler.createJob({
      prompt: 'run flaky task',
      schedule: 'every 1m',
      retry: { maxAttempts: 2, backoffMs: 1000 },
    })

    now = job.nextRunAt
    await scheduler.tick()
    now += 1000
    await scheduler.tick()

    const updated = (await scheduler.listJobs())[0]
    expect(updated).toMatchObject({
      status: 'paused',
      failureCount: 2,
      consecutiveFailures: 2,
      lastRunStatus: 'failed',
      lastError: 'network down',
    })
  })

  it('does not dispatch locked jobs twice in the same tick window', async () => {
    let now = Date.UTC(2026, 0, 1, 0, 0, 0)
    let dispatchCount = 0
    const scheduler = new Scheduler({
      store: createInMemorySchedulerJobStore(),
      now: () => now,
      dispatchTask: async () => {
        dispatchCount++
        return { success: true, id: `task-${dispatchCount}` }
      },
    })
    const job = await scheduler.createJob({ prompt: 'locked work', schedule: 'every 1m' })

    now = job.nextRunAt
    await Promise.all([scheduler.tick(), scheduler.tick()])

    expect(dispatchCount).toBe(1)
  })

  it('persists file-backed jobs across store instances', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'x-mars-scheduler-store-'))
    const filePath = join(dir, 'jobs.json')
    const firstStore = createFileSchedulerJobStore(filePath)
    const scheduler = new Scheduler({
      store: firstStore,
      now: () => Date.UTC(2026, 0, 1, 0, 0, 0),
      dispatchTask: async () => ({ success: true, id: 'task-1' }),
    })

    const job = await scheduler.createJob({
      prompt: 'persisted work',
      schedule: 'every 1h',
      subagent: 'explorer',
    })
    await firstStore.update(job.id, { lastTaskId: 'task-1', runCount: 1 })

    const secondStore = createFileSchedulerJobStore(filePath)
    const jobs = await secondStore.list()

    expect(jobs).toEqual([
      expect.objectContaining({
        id: job.id,
        prompt: 'persisted work',
        subagent: 'explorer',
        lastTaskId: 'task-1',
        runCount: 1,
      }),
    ])
  })
})
