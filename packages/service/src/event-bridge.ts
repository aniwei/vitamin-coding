import type { AgentSessionEvent } from '@vitamin/agent'
import type { StreamEvent, TextContent } from '@vitamin/ai'
import type { WebSocketMessage } from './types'
import type { WebSocketManager } from './websocket-manager'
import type { AgentSession } from '@vitamin/coding'

export class EventBridge {
  private unsubscribeSession?: () => void

  constructor(
    private readonly session: AgentSession,
    private readonly ws: WebSocketManager,
  ) {}

  private onPrompStart = (_id: string, text: string) => {
    const sid = this.session.id
    this.send(sid, {
      type: 'Chat.userMessage',
      data: { sessionId: sid, content: text, timestamp: new Date().toISOString() },
    })

    this.send(sid, {
      type: 'Chat.messageStart',
      data: { sessionId: sid, role: 'assistant' },
    })
  }

  private onPromptEnd = () => {
    const sid = this.session.id
    this.send(sid, {
      type: 'Chat.messageComplete',
      data: { sessionId: sid },
    })
  }

  private onError = (_id: string, error: Error) => {
    const sid = this.session.id
    this.send(sid, {
      type: 'Runtime.error',
      data: { sessionId: sid, message: error.message },
    })
  }

  attach(): void {
    this.session.on('prompt_start', this.onPrompStart)
    this.session.on('prompt_end', this.onPromptEnd)
    this.session.on('error', this.onError)

    // Subscribe to session-level events (gate + agent lifecycle)
    this.unsubscribeSession = this.session.subscribe((event) => {
      const sid = this.session.id
      switch (event.type) {
        case 'stream_event': {
          if (event.event.type === 'done' || event.event.type === 'tool_call_end') {
            break
          }

          const messages = this.createMessageFromStreamEvent(sid, event.event)
          if (messages) {
            for (const msg of Array.isArray(messages) ? messages : [messages]) {
              this.send(sid, msg)
            }
          }
          break
        }
        case 'approval_required':
          this.send(sid, {
            type: 'Chat.approvalRequired',
            data: {
              sessionId: sid,
              id: event.id,
              toolName: event.toolName,
              arguments: event.arguments,
              description: event.description,
            },
          })
          break
        case 'approval_resolved':
          this.send(sid, {
            type: 'Chat.approvalResolved',
            data: { sessionId: sid, id: event.id, approved: event.approved },
          })
          break
        case 'ask_user_required':
          this.send(sid, {
            type: 'Chat.askUserRequired',
            data: {
              sessionId: sid,
              requestId: event.requestId,
              questions: event.questions,
            },
          })
          break
        case 'ask_user_resolved':
          this.send(sid, {
            type: 'Chat.askUserResolved',
            data: { sessionId: sid, requestId: event.requestId },
          })
          break
        case 'plan_approval_required':
          this.send(sid, {
            type: 'Chat.planApprovalRequired',
            data: {
              sessionId: sid,
              requestId: event.requestId,
              planContent: event.planContent,
            },
          })
          break
        case 'plan_approval_resolved':
          this.send(sid, {
            type: 'Chat.planApprovalResolved',
            data: { sessionId: sid, requestId: event.requestId, action: event.action },
          })
          break
        default: {
          const messages = this.createMessageFromSessionEvent(sid, event)
          if (messages) {
            for (const msg of Array.isArray(messages) ? messages : [messages]) {
              this.send(sid, msg)
            }
          }
          break
        }
      }
    })
  }

  handleStreamEvent(event: StreamEvent): void {
    const sid = this.session.id
    const messages = this.createMessageFromStreamEvent(sid, event)
    if (messages) {
      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        this.send(sid, msg)
      }
    }
  }

  handleSessionEvent(event: AgentSessionEvent): void {
    const sid = this.session.id
    const messages = this.createMessageFromSessionEvent(sid, event)
    if (messages) {
      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        this.send(sid, msg)
      }
    }
  }

  private send(sessionId: string, message: WebSocketMessage): void {
    this.ws.sendToSession(sessionId, message)
  }

  private createMessageFromStreamEvent(
    sessionId: string,
    event: StreamEvent,
  ): WebSocketMessage | WebSocketMessage[] | null {
    switch (event.type) {
      case 'text_delta':
        return {
          type: 'Chat.messageChunk',
          data: { sessionId, content: event.delta, role: 'assistant' },
        }

      case 'thinking_start':
        return {
          type: 'Chat.thinkingBlock',
          data: { sessionId, action: 'start', index: event.index },
        }

      case 'thinking_delta':
        return {
          type: 'Chat.thinkingBlock',
          data: { sessionId, action: 'delta', delta: event.delta, index: event.index },
        }

      case 'thinking_end':
        return {
          type: 'Chat.thinkingBlock',
          data: { sessionId, action: 'end', content: event.content, index: event.index },
        }

      case 'tool_call_end': {
        const tc = event.toolCall
        return {
          type: 'Chat.toolCall',
          data: {
            sessionId,
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments ?? {},
          },
        }
      }

      case 'done': {
        const events: WebSocketMessage[] = []

        const blocks = event.message.content.filter((b): b is TextContent => b.type === 'text')
        if (blocks.length > 0) {
          const fullText = blocks.map((b) => b.text).join('')
          events.push({
            type: 'Chat.messageComplete',
            data: { sessionId, content: fullText, role: 'assistant' },
          })
        }

        return events
      }

      case 'error':
        return {
          type: 'Runtime.error',
          data: { sessionId, message: event.error.message },
        }

      default:
        return null
    }
  }

  private createMessageFromSessionEvent(
    sessionId: string,
    event: AgentSessionEvent,
  ): WebSocketMessage | WebSocketMessage[] | null {
    switch (event.type) {
      case 'tool_call_start':
        return {
          type: 'Chat.toolCall',
          data: {
            sessionId,
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
            status: 'started',
          },
        }

      case 'tool_call_end':
        return {
          type: 'Chat.toolResult',
          data: {
            sessionId,
            id: event.toolCall.id,
            name: event.toolCall.name,
            isError: event.isError,
          },
        }

      case 'streaming_start':
        return {
          type: 'Session.statusUpdate',
          data: { sessionId, status: 'streaming', model: event.model },
        }

      case 'streaming_end':
        return {
          type: 'Session.statusUpdate',
          data: { sessionId, status: 'idle', model: event.model, stopReason: event.stopReason },
        }

      case 'turn_start':
        return {
          type: 'Chat.progress',
          data: { sessionId, phase: 'turn', turnIndex: event.turnIndex },
        }

      case 'compaction_start':
        return {
          type: 'Session.statusUpdate',
          data: { sessionId, status: 'compacting', messageCount: event.messageCount },
        }

      case 'compaction_end':
        return {
          type: 'Session.statusUpdate',
          data: { sessionId, status: 'idle', retainedCount: event.retainedCount },
        }

      case 'error':
        return {
          type: 'Runtime.error',
          data: { sessionId, message: event.error.message },
        }

      default:
        return null
    }
  }

  detach(): void {
    this.session.off('prompt_start', this.onPrompStart)
    this.session.off('prompt_end', this.onPromptEnd)
    this.session.off('error', this.onError)
    this.unsubscribeSession?.()
    this.unsubscribeSession = undefined
  }

  dispose(): void {
    this.detach()
  }
}
