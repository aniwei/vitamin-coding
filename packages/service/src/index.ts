export { CodingService, createCodingService } from './coding-service'
export { WebSocketManager } from './websocket-manager'
export { EventBridge } from './event-bridge'
export { DebugBridge } from './debug-bridge'
export { InboundRouter } from './inbound-router'
export { routeSessionEvent } from './session-event-router'
export { routeDebugEvent } from './debug-event-router'
export { serializeSessionMessages } from './message-serializer'
export type { SerializedMessage, SerializedToolCall } from './message-serializer'
export type {
  CodingServiceOptions,
  WebSocketMessage,
  WebSocketEventType,
  WebSocketClientMessage,
  WebSocketClientMessageType,
  EventBridgeMapper,
  IMessageSender,
  LogEntryData,
  // Per-message data types
  ChatQueryData,
  ChatApprovalData,
  ChatAskUserResponseData,
  ChatPlanApprovalResponseData,
  SessionSubscribeData,
  DebuggerCommandData,
  DebuggerSetBreakpointData,
  DebuggerSetBreakpointsActiveData,
} from './types'
