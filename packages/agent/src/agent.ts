import { createLogger, TypedEventEmitter } from '@vitamin/shared'

import { workLoop } from './work-loop'
import { AbortError } from './errors'
import { createToolExecutor } from './tool-executor'

import type { AssistantMessage, Message as LlmMessage } from '@vitamin/ai'
import type {
  AgentConfig,
  AgentEvents,
  AgentMessage,
  AgentRunContext,
  AgentState,
  AgentStatus,
} from './types'

const logger = createLogger('@vitamin/agent')

const VALID_TRANSITIONS: Record<AgentStatus, Set<AgentStatus>> = {
  idle: new Set(['streaming', 'aborted', 'error']),
  streaming: new Set(['tool_executing', 'completed', 'aborted', 'error']),
  tool_executing: new Set(['streaming', 'aborted', 'error']),
  completed: new Set(['streaming', 'idle', 'aborted', 'error']),
  error: new Set(['idle', 'aborted']),
  aborted: new Set(['streaming', 'idle', 'error']),
}

export class Agent extends TypedEventEmitter<AgentEvents> {
  private state: AgentState
  private abortController: AbortController | null = null
  private steeringQueue: AgentMessage[] = []
  private followUpQueue: AgentMessage[] = []

  private readonly stream: import('./types').StreamFunction
  private readonly agentLogger: import('@vitamin/shared').Logger
  private readonly maxToolTurns: number
  private readonly agentName: string
  private readonly sessionId: string
  private readonly toolHookExecutor?: import('./types').ToolHookExecutor
  private readonly devtools?: import('@vitamin/devtools').Devtools
  private readonly approval?: (
    toolName: string,
    args: Record<string, unknown>,
    reason: string,
  ) => Promise<boolean>

  get status(): AgentStatus {
    return this.state.status
  }

  get turnCount(): number {
    return this.state.turnCount
  }

  constructor(config: AgentConfig) {
    super()

    this.stream = config.stream
    this.agentLogger = config.logger
    this.maxToolTurns = config.maxToolTurns ?? 25
    this.agentName = config.agentName ?? ''
    this.sessionId = config.sessionId ?? ''
    this.toolHookExecutor = config.toolHookExecutor
    this.devtools = config.devtools
    this.approval = config.approval

    this.state = {
      status: 'idle',
      turnCount: 0,
      tokenUsage: { input: 0, output: 0, cacheRead: 0 },
      isStreaming: false,
      currentStreamMessage: null,
      error: undefined,
    }

    this.on('status_change', ({ from: _, to }) => {
      this.state.status = to
      this.state.isStreaming = to === 'streaming'
    })

    this.on('turn_end', ({ message }) => {
      this.state.turnCount++
      this.state.currentStreamMessage = null
      this.state.tokenUsage.input += message.usage.inputTokens
      this.state.tokenUsage.output += message.usage.outputTokens
      this.state.tokenUsage.cacheRead += message.usage.cacheReadTokens
    })

    this.on('stream_event', ({ event }) => {
      if (event.type === 'start') {
        this.state.currentStreamMessage = event.partial
      }
    })
  }

  getState(): Readonly<AgentState> {
    return { ...this.state }
  }

  async run(context: AgentRunContext): Promise<AssistantMessage> {
    if (
      this.state.status !== 'idle' &&
      this.state.status !== 'completed' &&
      this.state.status !== 'aborted'
    ) {
      throw new Error(`Cannot run in ${this.state.status} status`)
    }

    return this.runLoop(context)
  }

  steer(message: AgentMessage): void {
    this.steeringQueue.push(message)
  }

  followUp(message: AgentMessage): void {
    this.followUpQueue.push(message)
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }

    this.transitionTo('aborted')
    this.emit('abort')
  }

  reset(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    this.steeringQueue = []
    this.followUpQueue = []
    this.state.turnCount = 0
    this.state.tokenUsage = { input: 0, output: 0, cacheRead: 0 }
    this.state.currentStreamMessage = null
    this.state.error = undefined
    this.state.status = 'idle'
  }

  private async runLoop(context: AgentRunContext): Promise<AssistantMessage> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const toolExecutor = createToolExecutor(context.tools, {
      hookExecutor: this.toolHookExecutor,
      agentName: this.agentName,
      sessionId: this.sessionId,
      devtools: this.devtools,
      approval: this.approval,
    })

    try {
      const result = await workLoop({
        model: context.model,
        systemPrompt: context.systemPrompt,
        messages: context.messages,
        thinkingLevel: context.thinkingLevel,
        maxTokens: context.maxTokens,
        temperature: context.temperature,
        convertToLLM: context.convertToLLM ?? defaultConvertToLLM,
        transformContext: context.transformContext,
        maxToolTurns: this.maxToolTurns,
        devtools: this.devtools,
        logger: this.agentLogger,
        getSteeringMessages: () => this.drainSteeringQueue(),
        getFollowUpMessages: () => this.drainFollowUpQueue(),
        toolExecutor,
        stream: this.stream,
        signal,
        emitter: this,
        initialStatus: this.state.status,
      })

      this.transitionTo('completed')
      return result
    } catch (error) {
      if (error instanceof AbortError || signal.aborted) {
        this.transitionTo('aborted')
        throw error
      }

      this.state.error = error instanceof Error ? error : new Error(String(error))
      this.transitionTo('error')
      this.emit('error', { error: this.state.error })
      throw this.state.error
    } finally {
      this.abortController = null
      this.state.isStreaming = false
    }
  }

  private transitionTo(to: AgentStatus): void {
    const from = this.state.status
    if (from === to) {
      return
    }

    const allowed = VALID_TRANSITIONS[from]
    if (!allowed?.has(to)) {
      logger.warn('Invalid state transition: %s → %s (ignored)', from, to)
      return
    }

    this.state.status = to
    this.emit('status_change', { from, to })
  }

  private async drainSteeringQueue(): Promise<AgentMessage[]> {
    const messages = [...this.steeringQueue]
    this.steeringQueue = []
    return messages
  }

  private async drainFollowUpQueue(): Promise<AgentMessage[]> {
    const messages = [...this.followUpQueue]
    this.followUpQueue = []
    return messages
  }
}

function defaultConvertToLLM(messages: AgentMessage[]) {
  return messages.filter((m) => typeof m === 'object' && m !== null && 'role' in m) as LlmMessage[]
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config)
}
