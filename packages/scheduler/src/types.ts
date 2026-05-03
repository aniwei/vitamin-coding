export type SchedulerJobStatus = 'active' | 'paused'
export type SchedulerRunStatus = 'completed' | 'failed'

export interface SchedulerSchedule {
  expression: string
  kind: 'interval' | 'cron'
  everyMs?: number
}

export interface SchedulerJobInput {
  prompt: string
  schedule: string
  subagent?: string
  category?: string
  parentSessionId?: string
  retry?: {
    maxAttempts?: number
    backoffMs?: number
  }
}

export interface SchedulerJob {
  id: string
  prompt: string
  schedule: SchedulerSchedule
  status: SchedulerJobStatus
  subagent?: string
  category?: string
  parentSessionId?: string
  retry: {
    maxAttempts: number
    backoffMs: number
  }
  nextRunAt: number
  lastRunAt?: number
  lastTaskId?: string
  lastRunStatus?: SchedulerRunStatus
  lastError?: string
  runCount: number
  failureCount: number
  consecutiveFailures: number
  lockedAt?: number
  createdAt: number
  updatedAt: number
}

export interface SchedulerJobStore {
  create(
    input: Omit<SchedulerJob, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<SchedulerJob>
  get(id: string): Promise<SchedulerJob | undefined>
  list(filter?: { status?: SchedulerJobStatus }): Promise<SchedulerJob[]>
  update(id: string, patch: Partial<SchedulerJob>): Promise<SchedulerJob | undefined>
  delete(id: string): Promise<boolean>
}

export interface SchedulerDispatchInput {
  prompt: string
  subagent?: string
  category?: string
  parentSessionId?: string
  mode: 'background'
}

export interface SchedulerDispatchResult {
  success: boolean
  id?: string
  status?: string
  output?: string
  error?: string
}

export type SchedulerTaskDispatch = (
  input: SchedulerDispatchInput,
) => Promise<SchedulerDispatchResult>

export interface SchedulerTickResult {
  now: number
  checked: number
  dispatched: Array<{
    jobId: string
    taskId?: string
    success: boolean
    error?: string
  }>
}
