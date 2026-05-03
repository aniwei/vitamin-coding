// 核心 Hook 集合导出
export {
  createFirstMessageVariantHook,
  createSessionRecoveryHook,
  createKeywordDetectionHook,
  createSessionHistoryHook,
  createIdleContinuationHook,
  createErrorRecoveryHook,
  resetErrorRecoveryCounter,
} from './session'
export type { IdleContinuationConfig, ErrorRecoveryConfig } from './session'

export {
  createFileGuardHook,
  createLabelTruncatorHook,
  createRulesInjectorHook,
  createOutputTruncationHook,
  createToolOutputPersistenceHook,
} from './tool-guard'
export type { ToolOutputPersistenceConfig } from './tool-guard'

export {
  createContextInjectorHook,
  createThinkingValidatorHook,
  createAnthropicEffortHook,
} from './transform'
export type { ContextInjectorConfig, ContextProvider } from './transform'

export {
  createCommentCheckerHook,
  createBabysittingHook,
  createRalphLoopHook,
  createPatchReviewGateHook,
} from './quality'
export type { PatchReviewGateConfig, PatchReviewSummary } from './quality'

export {
  createStreamMetricsHook,
  createStreamEndMetricsHook,
  getStreamMetrics,
  clearStreamMetrics,
} from './stream'

export {
  createCompactionLoggerHook,
  createCompactionAfterHook,
  getCompactionStats,
  clearCompactionStats,
} from './compaction'

export {
  createBackgroundStartHook,
  createBackgroundEndHook,
  getActiveBackgroundTasks,
  getCompletedBackgroundTasks,
  clearBackgroundTaskHistory,
} from './background'

export { createToolErrorTrackerHook, getToolErrors, clearToolErrors } from './tool-guard'
export type { ToolErrorTrackerConfig } from './tool-guard'

export { createTokenBudgetHook, trackTokenUsage, getTokenUsage, clearTokenUsage } from './transform'
export type { TokenBudgetConfig } from './transform'

export { createCommandHook, isCommandHookConfig } from './command'
export type {
  CommandHookConfig,
  CommandHookMatcher,
  CommandHookRunner,
  CommandHookRunInput,
  CommandHookRunResult,
} from './command'

// Permission
export {
  PermissionPolicyRegistry,
  PermissionAuditLog,
  PermissionGuardHook,
  compilePolicyFromSetting,
  createPermissionGuardHook,
  FILE_GUARD_POLICY,
  DESTRUCTIVE_COMMAND_POLICY,
  createFileGuardPolicy,
  createPermissionToolSetsFromRegistry,
  createDirectoryFreezePolicy,
  createDisabledToolsPolicy,
  createAgentBoundaryPolicy,
  createSidechainBoundaryPolicy,
  createPermissionModePolicy,
  createPermissionRegistry,
} from './permission'
export type {
  RuleEffect,
  PermissionMode,
  PolicyScope,
  PermissionContext,
  RuleMatch,
  PermissionRule,
  PermissionPolicy,
  PermissionDecision,
  PermissionAuditEntry,
  PermissionRuleConfig,
  PermissionPolicySetting,
  PermissionToolDescriptor,
  PermissionToolSets,
  PermissionToolSetsInput,
} from './permission'
