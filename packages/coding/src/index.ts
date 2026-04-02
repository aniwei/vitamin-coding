export { 
  createVitamin, 
  VitaminApp 
} from './app/vitamin-app'
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

// Modes
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

// Types
export type {
  AgentSessionOptions,
  AgentSessionInfo,
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  CreateAgentSessionOptions,
  PromptOptions,
} from './session/types'

// Prompt
export { PromptCache } from './prompt/prompt-cache'
export type { PromptSection } from './prompt/prompt-cache'
export { injectPhaseContext, extractPhaseFromMessage } from './prompt/phase-context'
export type { PhaseAnnotation } from './prompt/phase-context'
export {
  PHASE_DISCIPLINE,
  COMPLEXITY_ROUTING,
  REVIEW_GUIDANCE,
  WORKFLOW_OVERVIEW,
  FILE_STATE_GUIDANCE,
  MODEL_SLOT_GUIDANCE,
  assembleLeadPrompt,
} from './prompt/lead-guidance'
export { buildLessonInjection, SESSION_END_LEARNING_PROMPT } from './prompt/lesson-injection'
