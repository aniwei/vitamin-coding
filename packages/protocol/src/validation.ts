import type { WebSocketMessage } from './types'

const MESSAGE_REQUIREMENTS: Record<string, readonly string[]> = {
  'Runtime.connected': ['clientId'],
  'Runtime.connectionState': ['status', 'timestamp'],
  'Runtime.pong': ['timestamp'],
  'Runtime.error': ['message'],
  'Chat.userMessage': ['sessionId', 'content', 'timestamp'],
  'Chat.messageStart': ['sessionId', 'role'],
  'Chat.messageChunk': ['sessionId', 'content', 'role'],
  'Chat.messageComplete': ['sessionId'],
  'Chat.thinkingBlock': ['sessionId', 'action', 'index'],
  'Chat.toolCall': ['sessionId', 'id', 'name', 'arguments', 'status'],
  'Chat.toolResult': ['sessionId', 'id', 'name', 'isError'],
  'Chat.toolExecutionEvent': ['sessionId', 'event'],
  'Chat.nestedToolCall': ['sessionId', 'id', 'name', 'arguments'],
  'Chat.nestedToolResult': ['sessionId', 'id', 'isError'],
  'Chat.approvalRequired': ['sessionId', 'id', 'toolName', 'arguments', 'description'],
  'Chat.approvalResolved': ['sessionId', 'id', 'approved'],
  'Chat.askUserRequired': ['sessionId', 'requestId', 'questions'],
  'Chat.askUserResolved': ['sessionId', 'requestId'],
  'Chat.planApprovalRequired': ['sessionId', 'requestId', 'planContent'],
  'Chat.planApprovalResolved': ['sessionId', 'requestId', 'action'],
  'Chat.planContent': ['sessionId', 'content'],
  'Chat.reviewRequested': ['sessionId', 'review'],
  'Chat.reviewPassed': ['sessionId', 'review'],
  'Chat.reviewFailed': ['sessionId', 'review', 'issues'],
  'Chat.subagentStart': ['sessionId', 'agentName'],
  'Chat.subagentComplete': ['sessionId', 'agentName'],
  'Chat.parallelAgentsStart': ['sessionId', 'count'],
  'Chat.parallelAgentsDone': ['sessionId'],
  'Chat.taskCompleted': ['sessionId', 'taskId'],
  'Chat.progress': ['sessionId', 'phase'],
  'Session.statusUpdate': ['sessionId', 'status'],
  'Session.activity': ['sessionId', 'action', 'timestamp'],
  'MCP.statusUpdate': ['serverId', 'status'],
  'MCP.serversUpdate': ['servers'],
  'Debugger.paused': ['reason', 'pauseId', 'timestamp'],
  'Debugger.resumed': ['pauseId', 'timestamp'],
  'Debugger.commandRejected': ['code', 'timestamp'],
  'Debugger.breakpointsChanged': ['breakpoints'],
  'Log.entryAdded': ['entry'],
}

export interface WebSocketMessageValidation {
  valid: boolean
  reason?: string
}

export function validateWebSocketMessage(message: unknown): WebSocketMessageValidation {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { valid: false, reason: 'message must be an object' }
  }

  const record = message as Record<string, unknown>
  if (typeof record.type !== 'string') {
    return { valid: false, reason: 'message.type must be a string' }
  }

  const required = MESSAGE_REQUIREMENTS[record.type]
  if (!required) {
    return { valid: false, reason: `unknown message type: ${record.type}` }
  }

  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
    return { valid: false, reason: 'message.data must be an object' }
  }

  const data = record.data as Record<string, unknown>
  for (const key of required) {
    if (data[key] === undefined) {
      return { valid: false, reason: `missing data.${key}` }
    }
  }

  return validateSpecificMessage(record.type, data)
}

export function isValidWebSocketMessage(message: unknown): message is WebSocketMessage {
  return validateWebSocketMessage(message).valid
}

function validateSpecificMessage(
  type: string,
  data: Record<string, unknown>,
): WebSocketMessageValidation {
  switch (type) {
    case 'Runtime.connected':
      return expectString(data, 'clientId')
    case 'Runtime.connectionState':
      return validateConnectionState(data)
    case 'Runtime.pong':
      return expectNumber(data, 'timestamp')
    case 'Runtime.error':
      return expectString(data, 'message')
    case 'Chat.toolExecutionEvent':
      return validateToolExecutionEvent(data.event)
    case 'Chat.toolCall':
    case 'Chat.nestedToolCall':
    case 'Chat.approvalRequired':
      return validateRecordField(data, 'arguments')
    case 'Chat.reviewRequested':
    case 'Chat.reviewPassed':
      return validateReviewEvent(data.review)
    case 'Chat.reviewFailed':
      return allValid([
        validateReviewEvent(data.review),
        Array.isArray(data.issues)
          ? { valid: true }
          : { valid: false, reason: 'data.issues must be an array' },
      ])
    case 'Chat.toolResult':
    case 'Chat.nestedToolResult':
      return expectBoolean(data, 'isError')
    case 'Chat.messageChunk':
      return allValid([
        expectString(data, 'sessionId'),
        expectString(data, 'content'),
        expectString(data, 'role'),
      ])
    case 'Session.statusUpdate':
      return allValid([expectString(data, 'sessionId'), expectString(data, 'status')])
    case 'Session.activity':
      return allValid([
        expectString(data, 'sessionId'),
        expectString(data, 'action'),
        expectString(data, 'timestamp'),
      ])
    case 'Chat.approvalResolved':
      return expectBoolean(data, 'approved')
    case 'Chat.parallelAgentsStart':
      return expectNumber(data, 'count')
    case 'Chat.askUserRequired':
      return Array.isArray(data.questions)
        ? { valid: true }
        : { valid: false, reason: 'data.questions must be an array' }
    case 'MCP.serversUpdate':
      return Array.isArray(data.servers)
        ? { valid: true }
        : { valid: false, reason: 'data.servers must be an array' }
    default:
      return { valid: true }
  }
}

function validateConnectionState(data: Record<string, unknown>): WebSocketMessageValidation {
  const validStatus = new Set([
    'connecting',
    'connected',
    'reconnecting',
    'disconnected',
    'stale',
  ])
  if (typeof data.status !== 'string' || !validStatus.has(data.status)) {
    return { valid: false, reason: 'data.status must be a known connection status' }
  }
  return expectString(data, 'timestamp')
}

function validateToolExecutionEvent(value: unknown): WebSocketMessageValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, reason: 'data.event must be an object' }
  }

  const event = value as Record<string, unknown>
  if (typeof event.type !== 'string') {
    return { valid: false, reason: 'data.event.type must be a string' }
  }
  const allowed = new Set([
    'started',
    'approval_required',
    'approval_resolved',
    'progress',
    'error',
    'result',
  ])
  if (!allowed.has(event.type)) {
    return { valid: false, reason: `unknown data.event.type: ${event.type}` }
  }
  for (const key of ['toolCallId', 'toolName', 'timestamp']) {
    if (event[key] === undefined) {
      return { valid: false, reason: `missing data.event.${key}` }
    }
  }
  if (typeof event.toolCallId !== 'string') {
    return { valid: false, reason: 'data.event.toolCallId must be a string' }
  }
  if (typeof event.toolName !== 'string') {
    return { valid: false, reason: 'data.event.toolName must be a string' }
  }
  if (typeof event.timestamp !== 'number') {
    return { valid: false, reason: 'data.event.timestamp must be a number' }
  }
  return { valid: true }
}

function validateReviewEvent(value: unknown): WebSocketMessageValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, reason: 'data.review must be an object' }
  }

  const review = value as Record<string, unknown>
  for (const key of ['id', 'reviewType', 'toolCallId', 'toolName', 'risk', 'blocked']) {
    if (review[key] === undefined) {
      return { valid: false, reason: `missing data.review.${key}` }
    }
  }
  if (review.reviewType !== 'patch') {
    return { valid: false, reason: 'data.review.reviewType must be patch' }
  }
  if (review.risk !== 'low' && review.risk !== 'medium' && review.risk !== 'high') {
    return { valid: false, reason: 'data.review.risk must be low, medium, or high' }
  }
  if (typeof review.blocked !== 'boolean') {
    return { valid: false, reason: 'data.review.blocked must be a boolean' }
  }
  if (!Array.isArray(review.targets)) {
    return { valid: false, reason: 'data.review.targets must be an array' }
  }
  if (!Array.isArray(review.reasons)) {
    return { valid: false, reason: 'data.review.reasons must be an array' }
  }
  return { valid: true }
}

function validateRecordField(
  data: Record<string, unknown>,
  key: string,
): WebSocketMessageValidation {
  const value = data[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { valid: true }
    : { valid: false, reason: `data.${key} must be an object` }
}

function allValid(validations: WebSocketMessageValidation[]): WebSocketMessageValidation {
  return validations.find((validation) => !validation.valid) ?? { valid: true }
}

function expectString(data: Record<string, unknown>, key: string): WebSocketMessageValidation {
  return typeof data[key] === 'string'
    ? { valid: true }
    : { valid: false, reason: `data.${key} must be a string` }
}

function expectNumber(data: Record<string, unknown>, key: string): WebSocketMessageValidation {
  return typeof data[key] === 'number'
    ? { valid: true }
    : { valid: false, reason: `data.${key} must be a number` }
}

function expectBoolean(data: Record<string, unknown>, key: string): WebSocketMessageValidation {
  return typeof data[key] === 'boolean'
    ? { valid: true }
    : { valid: false, reason: `data.${key} must be a boolean` }
}
