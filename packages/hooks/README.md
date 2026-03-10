# @vitamin/hooks

Lifecycle hook engine with 17 built-in hooks across session, tool-guard, transform, and quality tiers.

## Installation

```bash
pnpm add @vitamin/hooks
```

## Usage

```typescript
import { createHookEngine, createFileGuardHook, createOutputTruncationHook } from '@vitamin/hooks'

const engine = createHookEngine()
engine.register(createFileGuardHook({ protectedPaths: ['/etc'] }))
engine.register(createOutputTruncationHook({ maxLength: 10000 }))

await engine.run('tool.execute.before', { toolName: 'write', args: { path: '/etc/passwd' } })
```

## Key Exports

| Export | Description |
|--------|-------------|
| `HookEngine`, `createHookEngine` | Core hook engine |
| `safeCreateHook`, `isHookEnabled` | Safe hook creation utilities |

### Built-in Hooks (17)

| Hook | Tier |
|------|------|
| `createFirstMessageVariantHook` | Session |
| `createSessionRecoveryHook` | Session |
| `createKeywordDetectionHook` | Session |
| `createSessionHistoryHook` | Session |
| `createIdleContinuationHook` | Session |
| `createErrorRecoveryHook` | Session |
| `createFileGuardHook` | Tool-Guard |
| `createLabelTruncatorHook` | Tool-Guard |
| `createRulesInjectorHook` | Tool-Guard |
| `createOutputTruncationHook` | Tool-Guard |
| `createContextInjectorHook` | Transform |
| `createThinkingValidatorHook` | Transform |
| `createAnthropicEffortHook` | Transform |
| `createCommentCheckerHook` | Quality |
| `createBabysittingHook` | Quality |
| `createRalphLoopHook` | Quality |

## Types

`HookTiming`, `HookInput`, `HookOutput`, `HookHandler`, `HookRegistration`, `HookPayloadMap`, `ChatMessageInput`, `ToolExecuteBeforeInput`, `ToolExecuteAfterInput`, `MessagesTransformInput`

## License

See [root README](../../README.md) for details.
