import { describe, expect, it } from 'vitest'

import { createSchedulerJob, type SchedulerControl, type SchedulerJobView } from '../src'

const signal = new AbortController().signal

describe('scheduler_job tool', () => {
  it('returns unavailable when scheduler control is missing', async () => {
    const tool = createSchedulerJob()

    const result = await tool.execute({
      id: 'scheduler-missing',
      params: { action: 'list' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('scheduler_job not available')
  })

  it('creates, lists, pauses, resumes, triggers, and ticks jobs', async () => {
    const jobs = new Map<string, SchedulerJobView>()
    const control: SchedulerControl = {
      create: async (input) => {
        const job = {
          id: 'job-1',
          prompt: input.prompt,
          schedule: input.schedule,
          status: 'active',
          nextRunAt: 123,
          parentSessionId: input.parentSessionId,
          runCount: 0,
          failureCount: 0,
        }
        jobs.set(job.id, job)
        return job
      },
      list: async () => [...jobs.values()],
      pause: async (id) => {
        const job = jobs.get(id)
        if (!job) {
          return undefined
        }
        const next = { ...job, status: 'paused' }
        jobs.set(id, next)
        return next
      },
      resume: async (id) => {
        const job = jobs.get(id)
        if (!job) {
          return undefined
        }
        const next = { ...job, status: 'active' }
        jobs.set(id, next)
        return next
      },
      trigger: async (id) => ({
        now: 456,
        checked: 1,
        dispatched: [{ jobId: id, taskId: 'task-1', success: true }],
      }),
      tick: async () => ({
        now: 789,
        checked: 1,
        dispatched: [{ jobId: 'job-1', taskId: 'task-2', success: true }],
      }),
    }
    const tool = createSchedulerJob(control)

    const created = await tool.execute({
      id: 'scheduler-create',
      params: { action: 'create', prompt: 'run report', schedule: 'every 5m' },
      signal,
      sessionId: 'parent-session',
    })
    expect(created.content[0]?.text).toContain('Scheduled job created: job-1')
    expect(created.details?.job).toMatchObject({ parentSessionId: 'parent-session' })

    const listed = await tool.execute({
      id: 'scheduler-list',
      params: { action: 'list' },
      signal,
    })
    expect(listed.content[0]?.text).toContain('job-1 [active] every 5m')

    const paused = await tool.execute({
      id: 'scheduler-pause',
      params: { action: 'pause', jobId: 'job-1' },
      signal,
    })
    expect(paused.details?.job).toMatchObject({ status: 'paused' })

    const resumed = await tool.execute({
      id: 'scheduler-resume',
      params: { action: 'resume', jobId: 'job-1' },
      signal,
    })
    expect(resumed.details?.job).toMatchObject({ status: 'active' })

    const triggered = await tool.execute({
      id: 'scheduler-trigger',
      params: { action: 'trigger', jobId: 'job-1' },
      signal,
    })
    expect(triggered.content[0]?.text).toContain('task task-1')

    const ticked = await tool.execute({
      id: 'scheduler-tick',
      params: { action: 'tick' },
      signal,
    })
    expect(ticked.details?.tick).toMatchObject({ checked: 1 })
  })
})
