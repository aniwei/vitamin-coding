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
} from './tool-guard'

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
} from './quality'
