// 会话 Hook 集合导出
export { createFirstMessageVariantHook } from './first-message-variant'
export { createSessionRecoveryHook } from './session-recovery'
export { createKeywordDetectionHook } from './keyword-detection'
export { createSessionHistoryHook } from './session-history'
export { createIdleContinuationHook } from './idle-continuation'
export type { IdleContinuationConfig } from './idle-continuation'
export { createErrorRecoveryHook, resetErrorRecoveryCounter } from './error-recovery'
export type { ErrorRecoveryConfig } from './error-recovery'
