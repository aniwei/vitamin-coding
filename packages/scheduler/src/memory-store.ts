import type { SchedulerJob, SchedulerJobStatus, SchedulerJobStore } from './types'

export class InMemorySchedulerJobStore implements SchedulerJobStore {
  private readonly jobs = new Map<string, SchedulerJob>()

  async create(
    input: Omit<SchedulerJob, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<SchedulerJob> {
    const now = Date.now()
    const job: SchedulerJob = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(job.id, cloneJob(job))
    return cloneJob(job)
  }

  async get(id: string): Promise<SchedulerJob | undefined> {
    const job = this.jobs.get(id)
    return job ? cloneJob(job) : undefined
  }

  async list(filter: { status?: SchedulerJobStatus } = {}): Promise<SchedulerJob[]> {
    return [...this.jobs.values()]
      .filter((job) => !filter.status || job.status === filter.status)
      .map((job) => cloneJob(job))
      .sort((a, b) => a.nextRunAt - b.nextRunAt || a.createdAt - b.createdAt)
  }

  async update(id: string, patch: Partial<SchedulerJob>): Promise<SchedulerJob | undefined> {
    const existing = this.jobs.get(id)
    if (!existing) {
      return undefined
    }

    const next = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    }
    this.jobs.set(id, cloneJob(next))
    return cloneJob(next)
  }

  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id)
  }
}

export function createInMemorySchedulerJobStore(): SchedulerJobStore {
  return new InMemorySchedulerJobStore()
}

function cloneJob(job: SchedulerJob): SchedulerJob {
  return {
    ...job,
    schedule: { ...job.schedule },
    retry: { ...job.retry },
  }
}
