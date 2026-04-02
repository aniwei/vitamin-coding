# @vitamin/hooks Design

## 1. Module Positioning

`@vitamin/hooks` provides a typed lifecycle hook system for runtime pipelines around chat, tools, session events, streaming, compaction, background tasks, and orchestrator events.

The module core is intentionally small:

- Typed hook timing + payload mapping
- Hook registry with deterministic ordering
- Built-in hooks for guardrails, transforms, quality checks, and observability
- Runtime-safe behavior (hook failures do not crash the chain)

## 2. Design Goals

- Strong typing between timing and payload shape
- Deterministic execution order by priority
- Fail-open runtime behavior for hook failures
- Fast onboarding through presets (`default`, `strict`, `minimal`, `none`)
- Low coupling: each hook is an independent registration unit

## 3. Non-Goals

- Persistent storage of hook state across process restarts
- Distributed synchronization between multiple runtime instances
- Transactional guarantees across multiple hooks

## 4. Public API Surface

### 4.1 Registry API

- `HookRegistry`
- `createHookRegistry(options?)`

Core methods:

- `register(registration)`
- `registerAll(registrations)`
- `on(timing, name, handler, priority?)`
- `unregister(name)`
- `has(name)`
- `getRegistered(timing?)`
- `disable(name)` / `enable(name)`
- `execute(timing, input, output)` for chain-style hooks
- `emit(timing, input)` for event-style hooks
- `clear()`

### 4.2 Safe Utilities

- `safeCreateHook(name, factory, { enabled })`
- `isHookEnabled(hookName, disabledHooks)`
- `safeHookEnabled` (legacy alias)

## 5. Timing and Type System

`src/types.ts` defines:

- `HookTiming`: 28 lifecycle timings
- `HookPayloadMap`: timing to `{ input, output }` mapping
- `HookInput<T>` / `HookOutput<T>` generic extraction
- `HookHandle<T>` typed handler signature

The registry relies on this contract to keep timing and payload alignment explicit at compile time.

## 6. Runtime Architecture

### 6.1 Internal Data Model

`HookRegistry` stores hooks in per-timing buckets:

- `Record<HookTiming, RuntimeHook[]>`
- A runtime `disabled` set for temporary off switches

Each `RuntimeHook` keeps:

- Static metadata (`name`, `timing`, `priority`, `enabled`)
- `run(input, output)` for output hooks
- `emit(input)` for event hooks

### 6.2 Execution Flow

1. Read hooks for timing bucket
2. Filter by `enabled` and `disabled` set
3. Sort by ascending `priority`
4. Execute sequentially
5. Catch and log errors per hook, continue chain

This guarantees deterministic ordering while keeping runtime resilient.

## 7. Built-in Hook Catalog

### 7.1 Session

- `createFirstMessageVariantHook` (`chat.message.before`)
- `createSessionRecoveryHook` (`chat.message.before`)
- `createKeywordDetectionHook` (`chat.message.before`)
- `createSessionHistoryHook` (`chat.message.before`)
- `createIdleContinuationHook` (`session.idle`)
- `createErrorRecoveryHook` (`session.error`)
- `resetErrorRecoveryCounter(sessionId)`

### 7.2 Tool Guard

- `createFileGuardHook` (`tool.execute.before`)
- `createLabelTruncatorHook` (`tool.execute.before`)
- `createRulesInjectorHook(projectRoot)` (`tool.execute.before`)
- `createOutputTruncationHook(maxOutputSize?)` (`tool.execute.after`)
- `createToolErrorTrackerHook(config?)` (`tool.execute.after`)
- `getToolErrors(sessionId)` / `clearToolErrors(sessionId)`

### 7.3 Transform

- `createContextInjectorHook(config)` (`messages.transform`)
- `createThinkingValidatorHook()` (`messages.transform`)
- `createAnthropicEffortHook()` (`chat.params`)
- `createTokenBudgetHook(config?)` (`chat.params`)
- `trackTokenUsage(sessionId, model, inputTokens, outputTokens)`
- `getTokenUsage(sessionId)` / `clearTokenUsage(sessionId)`

### 7.4 Quality

- `createCommentCheckerHook` (`tool.execute.after`)
- `createBabysittingHook` (`tool.execute.after`)
- `createRalphLoopHook` (`tool.execute.after`)

### 7.5 Observability

- Stream:
  - `createStreamMetricsHook` (`stream.start`)
  - `createStreamEndMetricsHook` (`stream.end`)
  - `getStreamMetrics(sessionId)` / `clearStreamMetrics(sessionId)`
- Compaction:
  - `createCompactionLoggerHook` (`compaction.before`)
  - `createCompactionAfterHook` (`compaction.after`)
  - `getCompactionStats(sessionId)` / `clearCompactionStats(sessionId)`
- Background:
  - `createBackgroundStartHook` (`background.start`)
  - `createBackgroundEndHook` (`background.end`)
  - `getActiveBackgroundTasks()`
  - `getCompletedBackgroundTasks()`
  - `clearBackgroundTaskHistory()`

## 8. Preset Design

Preset behavior is implemented in `getPresetHooks`.

- `default` (14 hooks):
  - `file-guard`, `output-truncation`, `label-truncator`, `thinking-validator`, `anthropic-effort`, `first-message-variant`, `babysitting`, `ralph-loop`, `stream-metrics`, `compaction-logger`, `tool-error-tracker`, `token-budget`, `background-start-tracker`, `background-end-tracker`
- `strict`:
  - all `default` hooks + `comment-checker`
- `minimal`:
  - `file-guard`, `output-truncation`
- `none`:
  - no auto-registered hooks

## 9. Stateful Components and Lifecycle

Several built-in hooks keep in-memory state:

- Error recovery retry counters (`session.error`)
- Rules injector cache per project root
- Tool error tracking per session/tool
- Token usage tracking per session
- Babysitting and loop detection histories
- Stream and compaction metrics
- Background task active/history records

Design implication:

- State is process-local and non-persistent
- Session-scoped state (`tool errors` / `token usage` / `stream metrics` / `compaction stats`) should be cleared during session cleanup when needed
- `clearBackgroundTaskHistory()` is process-wide and clears all background task history, so it should be treated as an operational maintenance action rather than per-session cleanup

## 10. Error Handling Strategy

- Registry-level: all hook execution errors are caught and logged
- Hook-level: selected hooks may throw typed errors (example: `file-guard`), but execution wrapper still prevents runtime crash
- Effect: one hook failure should not block downstream hooks by default

## 11. Performance Characteristics

- Dispatch cost per timing is approximately:
  - filter + sort + sequential handler execution
- Sorting is currently done on each dispatch call
- Most hooks are lightweight mutation/check operations
- Heavy hooks are explicit (filesystem reads in rules injector, map scans for loop detection)

## 12. Integration Contract

Typical runtime wiring:

1. Instantiate registry
2. Register preset and custom hooks
3. Call `execute` at chain points (`chat.message.before`, `tool.execute.before`, `tool.execute.after`, `messages.transform`, `chat.params`)
4. Call `emit` at event points (`session.*`, `stream.*`, `compaction.*`, `background.*`, orchestrator timings)
5. Read observability state and clear per-session state when session ends

Note:
- `clearBackgroundTaskHistory()` is global (process scope), not session-scoped.

## 13. Testing Coverage Summary

Current tests cover:

- Registry behavior (register/unregister/clear/has/presets/disable-enable)
- Priority order and fail-open execution
- Event-style emit hooks
- Core hook behavior branches (guarding, transforms, quality checks, token budget)
- Rules injector filesystem behavior
- Safe hook factory behavior
- Additional timing coverage including `system-prompt.transform`

## 14. Known Constraints

- `HookTiming` union and runtime `HOOK_TIMINGS` list are both maintained manually
- In-memory tracking maps can grow if integrator never clears per-session state
- Output truncation measures text length, not exact UTF-8 byte count
- File guard patterns are mostly Unix-path oriented

## 15. Evolution Directions

- Optional pre-sorted insertion to reduce repeated sort cost
- Optional TTL-based cleanup for long-lived state maps
- Stronger cross-package typing for orchestrator payloads beyond `Record<string, unknown>`
- Optional per-hook timeout/circuit-breaker wrapper at registry layer
