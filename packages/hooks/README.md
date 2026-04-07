# @vitamin/hooks

## 模块定位
提供 Hook 注册、调度与核心策略扩展点。

## 当前状态（基于源码）
- 包目录：`packages/hooks`
- 源码文件数：40
- 测试文件数：12
- 入口文件：`src/index.ts`

## 目录概览
- `src/`
  - `core/`
  - `hook-registry.ts`
  - `index.ts`
  - `safe-hook.ts`
  - `types.ts`
- `tests/`
  - `background-tasks.test.ts`
  - `core-hooks-coverage.test.ts`
  - `core-hooks.test.ts`
  - `error-recovery.test.ts`
  - `hook-registry-extended.test.ts`
  - `hook-registry.test.ts`
  - `idle-continuation.test.ts`
  - `permission.test.ts`
  - `rules-injector.test.ts`
  - `safe-hook.test.ts`
  - `token-usage.test.ts`
  - `tool-error-tracker.test.ts`

## 公开导出
```ts
export { HookRegistry, createHookRegistry } from './hook-registry'
export type { HookPreset, HookRegistryOptions } from './hook-registry'
export { safeCreateHook, isHookEnabled, safeHookEnabled } from './safe-hook'
export { createFirstMessageVariantHook, createSessionRecoveryHook, createKeywordDetectionHook, createSessionHistoryHook, createIdleContinuationHook, createErrorRecoveryHook, resetErrorRecoveryCounter, createFileGuardHook, createLabelTruncatorHook, createRulesInjectorHook, createOutputTruncationHook, createContextInjectorHook, createThinkingValidatorHook, createAnthropicEffortHook, createCommentCheckerHook, createBabysittingHook, createRalphLoopHook,
export type { ContextInjectorConfig, ContextProvider, IdleContinuationConfig, ErrorRecoveryConfig, ToolErrorTrackerConfig, TokenBudgetConfig } from './core'
export { PermissionPolicyRegistry, PermissionAuditLog, PermissionGuardHook, compilePolicyFromSetting, createPermissionGuardHook, FILE_GUARD_POLICY, DESTRUCTIVE_COMMAND_POLICY, createDirectoryFreezePolicy, createDisabledToolsPolicy, createAgentBoundaryPolicy, createPermissionModePolicy, createPermissionRegistry, } from './core'
export type { RuleEffect, PermissionMode, PolicyScope, PermissionContext, RuleMatch, PermissionRule, PermissionPolicy, PermissionDecision, PermissionAuditEntry, PermissionRuleConfig, PermissionPolicySetting, } from './core'
export type { HookTiming, HookInput, HookOutput, HookHandle, HookRegistration, HookPayloadMap, ChatMessageInput, ChatMessageOutput, ToolExecuteBeforeInput, ToolExecuteBeforeOutput, ToolExecuteAfterInput, ToolExecuteAfterOutput, MessagesTransformInput, MessagesTransformOutput, ChatParamsInput, ChatParamsOutput, SystemPromptTransformInput, SystemPromptTransformOutput, SessionEventInput, } from './types'
```

## 开发命令
- `pnpm --filter @vitamin/hooks build`
- `pnpm --filter @vitamin/hooks typecheck:project`
- `pnpm --filter @vitamin/hooks typecheck:file`
- `pnpm --filter @vitamin/hooks typecheck`
- `pnpm --filter @vitamin/hooks clean`

## 关联 Vitamin 包
- `@vitamin/agent`
- `@vitamin/shared`

## 维护说明
- 本文档已按当前源码结构同步更新。
- 同步日期：2026-04-07
