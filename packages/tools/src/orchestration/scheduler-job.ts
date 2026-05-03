import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const SchedulerJobArgsSchema = z.object({
  action: z.enum(['create', 'list', 'pause', 'resume', 'trigger', 'tick']),
  prompt: z.string().optional().describe('Prompt to run for a new scheduled job.'),
  schedule: z
    .string()
    .optional()
    .describe('Schedule expression, e.g. "every 5m", "@hourly", or "0 9 * * *".'),
  jobId: z.string().optional().describe('Target job ID for pause/resume/trigger.'),
  sessionId: z
    .string()
    .optional()
    .describe(
      'Optional parent session ID that should receive scheduled task progress events. Defaults to the current session.',
    ),
  subagent: z.string().optional().describe('Optional subagent to run the scheduled task.'),
  category: z.string().optional().describe('Optional task category to route the scheduled task.'),
  now: z.number().int().optional().describe('Optional epoch ms used for deterministic tick tests.'),
})

type SchedulerJobArgs = z.infer<typeof SchedulerJobArgsSchema>

export interface SchedulerJobView {
  id: string
  prompt: string
  schedule: string
  status: string
  nextRunAt: number
  lastRunAt?: number
  lastTaskId?: string
  lastRunStatus?: string
  lastError?: string
  parentSessionId?: string
  runCount?: number
  failureCount?: number
}

export interface SchedulerTickView {
  now: number
  checked: number
  dispatched: Array<{ jobId: string; taskId?: string; success: boolean; error?: string }>
}

export interface SchedulerControl {
  create(input: {
    prompt: string
    schedule: string
    subagent?: string
    category?: string
    parentSessionId?: string
  }): Promise<SchedulerJobView>
  list(): Promise<SchedulerJobView[]>
  pause(id: string): Promise<SchedulerJobView | undefined>
  resume(id: string): Promise<SchedulerJobView | undefined>
  trigger(id: string): Promise<SchedulerTickView>
  tick(input?: { now?: number }): Promise<SchedulerTickView>
}

export function createSchedulerJob(control?: SchedulerControl): AgentTool<SchedulerJobArgs> {
  return {
    name: 'scheduler_job',
    description: 'Create, list, pause, resume, trigger, or tick scheduled background agent jobs.',
    parameters: SchedulerJobArgsSchema,
    visibility: 'always',

    async execute({ params, sessionId }): Promise<ToolResult> {
      if (!control) {
        return { content: [{ type: 'text', text: 'scheduler_job not available' }], isError: true }
      }

      if (params.action === 'create') {
        if (!params.prompt || !params.schedule) {
          throw new Error('prompt and schedule are required for scheduler_job create')
        }
        const job = await control.create({
          prompt: params.prompt,
          schedule: params.schedule,
          subagent: params.subagent,
          category: params.category,
          parentSessionId: params.sessionId ?? sessionId,
        })
        return {
          content: [{ type: 'text', text: `Scheduled job created: ${job.id}` }],
          details: { job },
        }
      }

      if (params.action === 'list') {
        const jobs = await control.list()
        return {
          content: [{ type: 'text', text: formatSchedulerJobs(jobs) }],
          details: { jobs },
        }
      }

      if (params.action === 'tick') {
        const tick = await control.tick({ now: params.now })
        return {
          content: [{ type: 'text', text: formatSchedulerTick(tick) }],
          details: { tick },
        }
      }

      const jobId = params.jobId
      if (!jobId) {
        throw new Error(`jobId is required for scheduler_job ${params.action}`)
      }

      if (params.action === 'trigger') {
        const tick = await control.trigger(jobId)
        return {
          content: [{ type: 'text', text: formatSchedulerTick(tick) }],
          details: { tick },
        }
      }

      const job =
        params.action === 'pause' ? await control.pause(jobId) : await control.resume(jobId)
      if (!job) {
        return {
          content: [{ type: 'text', text: `Scheduled job not found: ${jobId}` }],
          isError: true,
          details: { jobId },
        }
      }

      return {
        content: [{ type: 'text', text: `Scheduled job ${params.action}d: ${job.id}` }],
        details: { job },
      }
    },
  }
}

function formatSchedulerJobs(jobs: SchedulerJobView[]): string {
  if (jobs.length === 0) {
    return 'No scheduled jobs.'
  }

  return [
    'Scheduled jobs:',
    ...jobs.map(
      (job) =>
        `- ${job.id} [${job.status}] ${job.schedule} next=${new Date(job.nextRunAt).toISOString()}: ${job.prompt}`,
    ),
  ].join('\n')
}

function formatSchedulerTick(tick: SchedulerTickView): string {
  if (tick.dispatched.length === 0) {
    return `Scheduler tick checked ${tick.checked} jobs; no jobs dispatched.`
  }

  return [
    `Scheduler tick checked ${tick.checked} jobs; dispatched ${tick.dispatched.length}.`,
    ...tick.dispatched.map((item) =>
      item.success
        ? `- ${item.jobId}: dispatched${item.taskId ? ` task ${item.taskId}` : ''}`
        : `- ${item.jobId}: failed${item.error ? ` (${item.error})` : ''}`,
    ),
  ].join('\n')
}
