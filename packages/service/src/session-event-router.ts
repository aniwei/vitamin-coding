/**
 * session-event-router.ts
 *
 * 纯路由表：AgentSessionEvent → WebSocketMessage[]
 *
 * 这是整个 session → WS 消息流的唯一入口。
 * 所有"什么事件触发什么 WS 消息"的逻辑都在这一个文件里，一眼可见。
 *
 * 调用链：
 *   AgentSession.publish() → EventBridge.subscribe() → routeSessionEvent() → ws.sendToSession()
 */

import type { AgentSessionEvent } from '@x-mars/agent'
import type { StreamEvent } from '@x-mars/ai'
import type { WebSocketMessage } from './types'

// ─── 主路由函数 ────────────────────────────────────────────────────────────────

export function routeSessionEvent(event: AgentSessionEvent): WebSocketMessage[] {
  const sid = event.sessionId

  switch (event.type) {
    // ── 会话生命周期 ──────────────────────────────────────────────────────────
    case 'session_start':
      return [
        { type: 'Session.activity', data: { sessionId: sid, action: 'created', timestamp: now() } },
      ]

    case 'session_end':
      return [
        { type: 'Session.activity', data: { sessionId: sid, action: 'ended', timestamp: now() } },
      ]

    // ── Prompt 生命周期 ───────────────────────────────────────────────────────
    case 'prompt_start':
      return [
        {
          type: 'Chat.userMessage',
          data: { sessionId: sid, content: event.text, timestamp: now() },
        },
        { type: 'Chat.messageStart', data: { sessionId: sid, role: 'assistant' } },
      ]

    case 'prompt_end':
      return [{ type: 'Chat.messageComplete', data: { sessionId: sid } }]

    // ── 流式事件（代理到 stream 路由）────────────────────────────────────────
    case 'stream_event':
      return routeStreamEvent(sid, event.event)

    // ── Agent 执行状态 ────────────────────────────────────────────────────────
    case 'streaming_start':
      return [
        {
          type: 'Session.statusUpdate',
          data: { sessionId: sid, status: 'streaming', model: event.model },
        },
      ]

    case 'streaming_end':
      return [
        {
          type: 'Session.statusUpdate',
          data: {
            sessionId: sid,
            status: 'idle',
            model: event.model,
            stopReason: event.stopReason,
          },
        },
      ]

    case 'turn_start':
      return [
        {
          type: 'Chat.progress',
          data: { sessionId: sid, phase: 'turn', turnIndex: event.turnIndex },
        },
      ]

    case 'turn_end':
      return []

    case 'agent_status':
      return []

    case 'message_persisted':
      return []

    // ── 工具调用 ──────────────────────────────────────────────────────────────
    case 'tool_call_start':
      return [
        {
          type: 'Chat.toolCall',
          data: {
            sessionId: sid,
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
            status: 'started',
          },
        },
      ]

    case 'tool_call_end':
      return [
        {
          type: 'Chat.toolResult',
          data: {
            sessionId: sid,
            id: event.toolCall.id,
            name: event.toolCall.name,
            isError: event.isError,
          },
        },
      ]

    case 'tool_execution_event':
      return [
        {
          type: 'Chat.toolExecutionEvent',
          data: {
            sessionId: sid,
            event: event.event,
          },
        },
      ]

    case 'plugin_command_diagnostic':
      return [
        {
          type: 'Plugin.commandDiagnostic',
          data: {
            sessionId: sid,
            diagnostic: event.diagnostic,
          },
        },
      ]

    case 'review_requested':
      return [
        {
          type: 'Chat.reviewRequested',
          data: { sessionId: sid, review: event.review },
        },
      ]

    case 'review_passed':
      return [
        {
          type: 'Chat.reviewPassed',
          data: { sessionId: sid, review: event.review },
        },
      ]

    case 'review_failed':
      return [
        {
          type: 'Chat.reviewFailed',
          data: { sessionId: sid, review: event.review, issues: event.issues },
        },
      ]

    // ── 权限审批 ──────────────────────────────────────────────────────────────
    case 'approval_required':
      return [
        {
          type: 'Chat.approvalRequired',
          data: {
            sessionId: sid,
            id: event.id,
            toolName: event.toolName,
            arguments: event.arguments,
            description: event.description,
          },
        },
      ]

    case 'approval_resolved':
      return [
        {
          type: 'Chat.approvalResolved',
          data: { sessionId: sid, id: event.id, approved: event.approved },
        },
      ]

    // ── 用户问询 ──────────────────────────────────────────────────────────────
    case 'ask_user_required':
      return [
        {
          type: 'Chat.askUserRequired',
          data: { sessionId: sid, requestId: event.requestId, questions: event.questions },
        },
      ]

    case 'ask_user_resolved':
      return [
        { type: 'Chat.askUserResolved', data: { sessionId: sid, requestId: event.requestId } },
      ]

    // ── 计划审批 ──────────────────────────────────────────────────────────────
    case 'plan_approval_required':
      return [
        {
          type: 'Chat.planApprovalRequired',
          data: { sessionId: sid, requestId: event.requestId, planContent: event.planContent },
        },
      ]

    case 'plan_approval_resolved':
      return [
        {
          type: 'Chat.planApprovalResolved',
          data: { sessionId: sid, requestId: event.requestId, action: event.action },
        },
      ]

    // ── 上下文压缩 ────────────────────────────────────────────────────────────
    case 'compaction_start':
      return [
        {
          type: 'Session.statusUpdate',
          data: { sessionId: sid, status: 'compacting', messageCount: event.messageCount },
        },
      ]

    case 'compaction_end':
      return [
        {
          type: 'Session.statusUpdate',
          data: { sessionId: sid, status: 'idle', retainedCount: event.retainedCount },
        },
      ]

    // ── 错误 ──────────────────────────────────────────────────────────────────
    case 'error':
      return [{ type: 'Runtime.error', data: { sessionId: sid, message: event.error.message } }]

    default:
      return []
  }
}

// ─── 流式事件路由 ──────────────────────────────────────────────────────────────
//
// 注意：
//   - 'done' 事件不在此处理，prompt_end 会发送 Chat.messageComplete
//   - 'tool_call_end' stream 事件不在此处理，session 级的 tool_call_end 负责发 Chat.toolResult

function routeStreamEvent(sessionId: string, event: StreamEvent): WebSocketMessage[] {
  switch (event.type) {
    case 'text_delta':
      return [
        { type: 'Chat.messageChunk', data: { sessionId, content: event.delta, role: 'assistant' } },
      ]

    case 'thinking_start':
      return [
        { type: 'Chat.thinkingBlock', data: { sessionId, action: 'start', index: event.index } },
      ]

    case 'thinking_delta':
      return [
        {
          type: 'Chat.thinkingBlock',
          data: { sessionId, action: 'delta', delta: event.delta, index: event.index },
        },
      ]

    case 'thinking_end':
      return [
        {
          type: 'Chat.thinkingBlock',
          data: { sessionId, action: 'end', content: event.content, index: event.index },
        },
      ]

    case 'error':
      return [{ type: 'Runtime.error', data: { sessionId, message: event.error.message } }]

    // start / text_start / text_end / tool_call_start / tool_call_delta / tool_call_end / done
    // 均由 session 级事件或 prompt_end 覆盖，此处忽略
    default:
      return []
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}
