import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { SchedulerJob, SchedulerJobStatus, SchedulerJobStore } from './types'

interface SchedulerJobFile {
  jobs?: SchedulerJob[]
}

export class FileSchedulerJobStore implements SchedulerJobStore {
  private readonly jobs = new Map<string, SchedulerJob>()
  private loaded = false

  constructor(private readonly filePath: string) {}

  async create(
    input: Omit<SchedulerJob, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<SchedulerJob> {
    await this.load()
    const now = Date.now()
    const job: SchedulerJob = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(job.id, cloneJob(job))
    await this.persist()
    return cloneJob(job)
  }

  async get(id: string): Promise<SchedulerJob | undefined> {
    await this.load()
    const job = this.jobs.get(id)
    return job ? cloneJob(job) : undefined
  }

  async list(filter: { status?: SchedulerJobStatus } = {}): Promise<SchedulerJob[]> {
    await this.load()
    return [...this.jobs.values()]
      .filter((job) => !filter.status || job.status === filter.status)
      .map((job) => cloneJob(job))
      .sort((a, b) => a.nextRunAt - b.nextRunAt || a.createdAt - b.createdAt)
  }

  async update(id: string, patch: Partial<SchedulerJob>): Promise<SchedulerJob | undefined> {
    await this.load()
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
    await this.persist()
    return cloneJob(next)
  }

  async delete(id: string): Promise<boolean> {
    await this.load()
    const deleted = this.jobs.delete(id)
    if (deleted) {
      await this.persist()
    }
    return deleted
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return
    }
    this.loaded = true

    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw error
    }

    const parsed = JSON.parse(raw) as SchedulerJob[] | SchedulerJobFile
    const jobs = Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])
    for (const job of jobs) {
      if (job && typeof job.id === 'string') {
        this.jobs.set(job.id, cloneJob(job))
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmpPath = `${this.filePath}.tmp`
    const jobs = [...this.jobs.values()].sort(
      (a, b) => a.nextRunAt - b.nextRunAt || a.createdAt - b.createdAt,
    )
    await writeFile(`${tmpPath}.${process.pid}`, `${JSON.stringify({ jobs }, null, 2)}\n`, 'utf-8')
    await rename(`${tmpPath}.${process.pid}`, this.filePath)
  }
}

export function createFileSchedulerJobStore(filePath: string): SchedulerJobStore {
  return new FileSchedulerJobStore(filePath)
}

function cloneJob(job: SchedulerJob): SchedulerJob {
  return {
    ...job,
    schedule: { ...job.schedule },
    retry: { ...job.retry },
  }
}
