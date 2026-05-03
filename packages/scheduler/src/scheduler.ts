import { computeNextRunAt, parseScheduleExpression } from './schedule'
import type {
  SchedulerJob,
  SchedulerJobInput,
  SchedulerJobStore,
  SchedulerTaskDispatch,
  SchedulerTickResult,
} from './types'

export interface SchedulerOptions {
  store: SchedulerJobStore
  dispatchTask: SchedulerTaskDispatch
  now?: () => number
}

export class Scheduler {
  private readonly store: SchedulerJobStore
  private readonly dispatchTask: SchedulerTaskDispatch
  private readonly now: () => number
  private readonly runningJobIds = new Set<string>()

  constructor(options: SchedulerOptions) {
    this.store = options.store
    this.dispatchTask = options.dispatchTask
    this.now = options.now ?? Date.now
  }

  async createJob(input: SchedulerJobInput): Promise<SchedulerJob> {
    const now = this.now()
    const schedule = parseScheduleExpression(input.schedule)
    return await this.store.create({
      prompt: input.prompt,
      schedule,
      status: 'active',
      subagent: input.subagent,
      category: input.category,
      parentSessionId: input.parentSessionId,
      retry: {
        maxAttempts: input.retry?.maxAttempts ?? 3,
        backoffMs: input.retry?.backoffMs ?? 60_000,
      },
      nextRunAt: computeNextRunAt(schedule, now),
      runCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    })
  }

  async listJobs(): Promise<SchedulerJob[]> {
    return await this.store.list()
  }

  async pauseJob(id: string): Promise<SchedulerJob | undefined> {
    return await this.store.update(id, { status: 'paused', lockedAt: undefined })
  }

  async resumeJob(id: string): Promise<SchedulerJob | undefined> {
    const job = await this.store.get(id)
    if (!job) {
      return undefined
    }
    return await this.store.update(id, {
      status: 'active',
      nextRunAt: Math.max(job.nextRunAt, this.now()),
      lockedAt: undefined,
    })
  }

  async triggerJob(id: string): Promise<SchedulerTickResult> {
    const job = await this.store.get(id)
    if (!job) {
      return { now: this.now(), checked: 0, dispatched: [] }
    }

    await this.store.update(id, { status: 'active', nextRunAt: this.now(), lockedAt: undefined })
    return await this.tick({ limit: 1 })
  }

  async tick(options: { now?: number; limit?: number } = {}): Promise<SchedulerTickResult> {
    const now = options.now ?? this.now()
    const limit = options.limit ?? 25
    const active = await this.store.list({ status: 'active' })
    const due = active
      .filter((job) => job.nextRunAt <= now && !job.lockedAt)
      .slice(0, Math.max(0, limit))
    const dispatched: SchedulerTickResult['dispatched'] = []

    for (const job of due) {
      if (this.runningJobIds.has(job.id)) {
        continue
      }
      this.runningJobIds.add(job.id)
      const locked = await this.store.update(job.id, { lockedAt: now })
      if (!locked || locked.lockedAt !== now) {
        this.runningJobIds.delete(job.id)
        continue
      }

      try {
        const result = await this.dispatchTask({
          prompt: job.prompt,
          subagent: job.subagent,
          category: job.category,
          parentSessionId: job.parentSessionId,
          mode: 'background',
        })

        if (!result.success) {
          throw new Error(result.error ?? 'Scheduled task dispatch failed')
        }

        await this.store.update(job.id, {
          lockedAt: undefined,
          lastRunAt: now,
          lastTaskId: result.id,
          lastRunStatus: 'completed',
          lastError: undefined,
          runCount: job.runCount + 1,
          consecutiveFailures: 0,
          nextRunAt: computeNextRunAt(job.schedule, now),
        })
        dispatched.push({ jobId: job.id, taskId: result.id, success: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const consecutiveFailures = job.consecutiveFailures + 1
        const shouldPause = consecutiveFailures >= job.retry.maxAttempts
        await this.store.update(job.id, {
          lockedAt: undefined,
          status: shouldPause ? 'paused' : 'active',
          lastRunAt: now,
          lastRunStatus: 'failed',
          lastError: message,
          failureCount: job.failureCount + 1,
          consecutiveFailures,
          nextRunAt: now + job.retry.backoffMs,
        })
        dispatched.push({ jobId: job.id, success: false, error: message })
      } finally {
        this.runningJobIds.delete(job.id)
      }
    }

    return { now, checked: active.length, dispatched }
  }
}
