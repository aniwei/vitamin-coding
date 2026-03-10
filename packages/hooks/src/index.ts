// @vitamin/hooks — 生命周期 Hook 引擎
export { HookRegistry, createHookRegistry } from './hook-registry'
export { safeCreateHook, isHookEnabled, safeHookEnabled } from './safe-hook'

// 16 个核心 Hook
export {
  createFirstMessageVariantHook,
  createSessionRecoveryHook,
  createKeywordDetectionHook,
  createSessionHistoryHook,
  createIdleContinuationHook,
  createErrorRecoveryHook,
  resetErrorRecoveryCounter,
  createFileGuardHook,
  createLabelTruncatorHook,
  createRulesInjectorHook,
  createOutputTruncationHook,
  createContextInjectorHook,
  createThinkingValidatorHook,
  createAnthropicEffortHook,
  createCommentCheckerHook,
  createBabysittingHook,
  createRalphLoopHook,
} from './core'
export type { ContextInjectorConfig, ContextProvider, IdleContinuationConfig, ErrorRecoveryConfig } from './core'

// 类型导出
export type {
  HookTiming,
  HookInput,
  HookOutput,
  HookHandler,
  HookRegistration,
  HookPayloadMap,
  ChatMessageInput,
  ChatMessageOutput,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
  ToolExecuteAfterInput,
  ToolExecuteAfterOutput,
  MessagesTransformInput,
  MessagesTransformOutput,
  ChatParamsInput,
  ChatParamsOutput,
  SessionEventInput,
} from './types'
