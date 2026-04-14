export { createVitamin, VitaminApp } from './app/vitamin-app'
export type { VitaminAppOptions, VitaminContext } from './types'

export { AgentSession } from './session/agent-session'
export { createAgentSession } from './session/create-agent-session'

export {
  CodingSessionManager,
  createDiskCodingSessionManager,
  createInMemoryCodingSessionManager,
  createRemoteCodingSessionManager,
} from './session/coding-session-manager'
export type { CodingSessionManagerOptions as SessionManagerOptions } from './session/coding-session-manager'

export {
  InteractiveMode,
  getLastAssistantText,
  runJsonMode,
  runPrintMode,
  runRpcMode,
} from './modes/run-modes'
export type {
  InteractiveResult,
  JsonModeResult,
  RpcPromptParams,
  RpcRequest,
  RpcResponse,
} from './modes/run-modes'

export type {
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  AskUserQuestion,
  CreateAgentSessionOptions,
  PromptOptions,
} from './session/types'

export {
  createToolGuidanceHook,
  createEnvironmentInjectionHook,
  createLessonInjectionHook,
  createPhaseTrackingHooks,
  createSessionLearningHooks,
} from './hooks'
