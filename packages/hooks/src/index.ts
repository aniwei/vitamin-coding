// @vitamin/hooks — 生命周期 Hook 引擎
export { HookRegistry, createHookRegistry, HookEngine, createHookEngine } from './hook-registry'
export type { HookPreset, HookRegistryOptions, HookEngineOptions } from './hook-registry'
export { safeCreateHook, isHookEnabled, safeHookEnabled } from './safe-hook'

// 核心 Hook
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
  // Stream 生命周期
  createStreamMetricsHook,
  createStreamEndMetricsHook,
  getStreamMetrics,
  clearStreamMetrics,
  // Compaction 生命周期
  createCompactionLoggerHook,
  createCompactionAfterHook,
  getCompactionStats,
  clearCompactionStats,
  // Background 生命周期
  createBackgroundStartHook,
  createBackgroundEndHook,
  getActiveBackgroundTasks,
  getCompletedBackgroundTasks,
  clearBackgroundTaskHistory,
  // Tool 错误追踪
  createToolErrorTrackerHook,
  getToolErrors,
  clearToolErrors,
  // Token 预算
  createTokenBudgetHook,
  trackTokenUsage,
  getTokenUsage,
  clearTokenUsage,
} from './core'
export type { ContextInjectorConfig, ContextProvider, IdleContinuationConfig, ErrorRecoveryConfig, ToolErrorTrackerConfig, TokenBudgetConfig } from './core'

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
  SystemPromptTransformInput,
  SystemPromptTransformOutput,
  SessionEventInput,
} from './types'
