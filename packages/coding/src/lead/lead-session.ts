import { getLastAssistantText } from '../modes/run-modes'
import type { AgentSession } from '../session/agent-session'
import type { Orchestrator, OrchestratorTask, SubagentResult, TaskOutput, TaskError } from '@vitamin/orchestrator'

export type LeadResultStatus = 'done' | 'done_with_concerns' | 'needs_context' | 'blocked'

export interface TaskSummary {
  id: string
  status: string
  prompt: string
  output?: string
}

export interface LeadResult {
  status: LeadResultStatus
  output: string
  concerns?: string
  missingContext?: string
  blockReason?: string
  tasks: TaskSummary[]
  sessionId: string
}

export interface LeadRunOptions {
  onTaskCreated?: (task: OrchestratorTask) => void
  onTaskCompleted?: (task: OrchestratorTask, result: TaskOutput, subagentResult?: SubagentResult) => void
  onTaskFailed?: (task: OrchestratorTask, error: TaskError) => void
}

const STATUS_PATTERN = /^(?:status:\s*)?(done_with_concerns|needs_context|blocked|done)\b/i

export function parseLeadResult(output: string, sessionId: string, tasks: TaskSummary[]): LeadResult {
  const trimmed = output.trim()
  const lines = trimmed.split(/\r?\n/)
  const firstLine = lines[0]?.trim() ?? ''
  const match = firstLine.match(STATUS_PATTERN)

  if (!match) {
    return { status: 'done', output: trimmed, tasks, sessionId }
  }

  const status = match[1]!.toLowerCase() as LeadResultStatus
  const detail = lines.slice(1).join('\n').trim() || undefined

  switch (status) {
    case 'done':
      return { status, output: trimmed, tasks, sessionId }
    case 'done_with_concerns':
      return { status, output: trimmed, concerns: detail, tasks, sessionId }
    case 'needs_context':
      return { status, output: trimmed, missingContext: detail, tasks, sessionId }
    case 'blocked':
      return { status, output: trimmed, blockReason: detail, tasks, sessionId }
  }
}

// ═══ LeadSession ═══

export class LeadSession {
  readonly session: AgentSession

  private orchestrator: Orchestrator | null
  private unsubscribes: Array<() => void> = []
  private disposed = false
  private taskSummaries: TaskSummary[] = []

  constructor(session: AgentSession, orchestrator: Orchestrator | null) {
    this.session = session
    this.orchestrator = orchestrator
  }

  get id(): string {
    return this.session.id
  }

  get status(): string {
    return this.session.status
  }

  async run(userPrompt: string, options?: LeadRunOptions): Promise<LeadResult> {
    if (this.disposed) {
      throw new Error(`LeadSession ${this.id} has been disposed`)
    }

    // 重置任务记录
    this.taskSummaries = []

    // 订阅 orchestrator 事件
    const cleanups = this.subscribeOrchestratorEvents(options)

    try {
      await this.session.prompt(userPrompt)

      const output = getLastAssistantText(this.session.session.messages())
      return parseLeadResult(output, this.id, [...this.taskSummaries])
    } finally {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }

  abort(): void {
    this.session.abort()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const unsub of this.unsubscribes) {
      unsub()
    }
    this.unsubscribes = []
    this.session.dispose()
  }

  private subscribeOrchestratorEvents(options?: LeadRunOptions): Array<() => void> {
    if (!this.orchestrator) return []

    const eventBus = this.orchestrator.eventBus
    const cleanups: Array<() => void> = []

    const onCreated = (payload: { task: OrchestratorTask }) => {
      options?.onTaskCreated?.(payload.task)
    }

    const onCompleted = (payload: { task: OrchestratorTask; result: TaskOutput; subagentResult?: SubagentResult }) => {
      this.taskSummaries.push({
        id: payload.task.id,
        status: payload.task.status,
        prompt: payload.task.input.prompt,
        output: payload.result.text,
      })
      options?.onTaskCompleted?.(payload.task, payload.result, payload.subagentResult)
    }

    const onFailed = (payload: { task: OrchestratorTask; error: TaskError }) => {
      this.taskSummaries.push({
        id: payload.task.id,
        status: payload.task.status,
        prompt: payload.task.input.prompt,
      })
      options?.onTaskFailed?.(payload.task, payload.error)
    }

    cleanups.push(eventBus.on('task.created', onCreated))
    cleanups.push(eventBus.on('task.completed', onCompleted))
    cleanups.push(eventBus.on('task.failed', onFailed))

    return cleanups
  }
}

export function createLeadSession(session: AgentSession, orchestrator: Orchestrator | null): LeadSession {
  return new LeadSession(session, orchestrator)
}
