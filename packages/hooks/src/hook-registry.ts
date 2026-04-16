import { createLogger } from '@vitamin/shared'
import { createFileGuardHook } from './core/tool-guard/file-guard'
import { createOutputTruncationHook } from './core/tool-guard/output-truncation'
import { createLabelTruncatorHook } from './core/tool-guard/label-truncator'
import { createThinkingValidatorHook } from './core/transform/thinking-validator'
import { createAnthropicEffortHook } from './core/transform/anthropic-effort'
import { createFirstMessageVariantHook } from './core/session/first-message-variant'
import { createBabysittingHook } from './core/quality/babysitting'
import { createRalphLoopHook } from './core/quality/ralph-loop'
import { createCommentCheckerHook } from './core/quality/comment-checker'
import { createStreamMetricsHook } from './core/stream/stream-metrics'
import { createCompactionLoggerHook } from './core/compaction/compaction-logger'
import { createToolErrorTrackerHook } from './core/tool-guard/tool-error-tracker'
import { createTokenBudgetHook } from './core/transform/token-budget'
import {
  createBackgroundStartHook,
  createBackgroundEndHook,
} from './core/background/background-tracker'

import type {
  HookHandle,
  HookInput,
  HookOutput,
  HookTiming,
  InterceptorTiming,
  ObserverTiming,
} from './types'
import {
  type HookSpec,
  type ObserverRuntimeHook,
  type InterceptorRuntimeHook,
  defineHook,
} from './hook-spec'

const logger = createLogger('@vitamin/hooks')

const HOOK_TIMINGS: HookTiming[] = [
  'chat.message.before',
  'chat.message.after',
  'tool.execute.before',
  'tool.execute.after',
  'messages.transform',
  'chat.params',
  'session.created',
  'session.deleted',
  'session.idle',
  'session.error',
  'stream.start',
  'stream.end',
  'compaction.before',
  'compaction.after',
  'background.start',
  'background.end',
  'extension.loaded',
  'extension.error',

  // orchestrator
  'task.created',
  'task.started',
  'task.completed',
  'task.failed',
  'task.cancelled',
  'task.recovered',
  'review.requested',
  'review.passed',
  'review.failed',

  // plan
  'plan.created',
  'plan.updated',
  'plan.task_updated',

  'system-prompt.transform',
]

export interface RegisteredHookInfo {
  name: string
  timing: HookTiming
  priority: number
  enabled: boolean
}

function createHookBuckets(): Record<HookTiming, HookSpec[]> {
  return {
    'chat.message.before': [],
    'chat.message.after': [],
    'tool.execute.before': [],
    'tool.execute.after': [],
    'messages.transform': [],
    'chat.params': [],
    'session.created': [],
    'session.deleted': [],
    'session.idle': [],
    'session.error': [],
    'stream.start': [],
    'stream.end': [],
    'compaction.before': [],
    'compaction.after': [],
    'background.start': [],
    'background.end': [],
    'extension.loaded': [],
    'extension.error': [],

    // orchestrator
    'task.created': [],
    'task.started': [],
    'task.completed': [],
    'task.failed': [],
    'task.cancelled': [],
    'task.recovered': [],
    'review.requested': [],
    'review.passed': [],
    'review.failed': [],

    // plan
    'plan.created': [],
    'plan.updated': [],
    'plan.task_updated': [],

    'system-prompt.transform': [],
  }
}

export type HookPreset = 'default' | 'strict' | 'minimal' | 'none'

export interface HookRegistryOptions {
  preset?: HookPreset
}

export class HookRegistry {
  private readonly hooks = createHookBuckets()
  private readonly disabled = new Set<string>()

  constructor(options?: HookRegistryOptions) {
    if (options?.preset && options.preset !== 'none') {
      this.applyPreset(options.preset)
    }
  }

  register(spec: HookSpec): void {
    this.hooks[spec.timing].push(spec)

    logger.debug(
      { hookName: spec.name, timing: spec.timing, priority: spec.priority },
      'Hook registered',
    )
  }

  registerAll(specs: HookSpec[]): void {
    for (const spec of specs) {
      this.register(spec)
    }
  }

  // 内联 defineHook 而非直接接受 handle，保持 on() 调用侧同样零 cast
  on<T extends HookTiming>(timing: T, name: string, handle: HookHandle<T>, priority = 50): this {
    this.register(defineHook({ name, timing, handle, priority }))

    return this
  }

  has(name: string): boolean {
    return this.getRegistered().some((h) => h.name === name)
  }

  unregister(name: string): boolean {
    let removed = false
    for (const timing of HOOK_TIMINGS) {
      const list = this.hooks[timing]
      const filtered = list.filter((hook) => hook.name !== name)

      if (filtered.length < list.length) {
        this.hooks[timing] = filtered
        removed = true

        logger.debug({ hookName: name, timing }, 'Hook unregistered')
      }
    }
    return removed
  }

  // 运行时屏蔽，不从 bucket 移除，便于快速恢复
  disable(name: string): void {
    this.disabled.add(name)
    logger.debug({ hookName: name }, 'Hook disabled')
  }

  enable(name: string): void {
    this.disabled.delete(name)
    logger.debug({ hookName: name }, 'Hook enabled')
  }

  getRegistered(timing?: HookTiming): RegisteredHookInfo[] {
    if (timing) {
      return this.hooks[timing].map(toHookInfo)
    }

    const all: RegisteredHookInfo[] = []
    for (const key of HOOK_TIMINGS) {
      all.push(...this.hooks[key].map(toHookInfo))
    }

    return all
  }

  // execute/emit 分离：编译期保证拦截器 timing 不能用 emit 触发，反之亦然
  async execute<T extends InterceptorTiming>(
    timing: T,
    input: HookInput<T>,
    output: HookOutput<T>,
  ): Promise<void> {
    const hooks = this.getSortedInterceptorHooks(timing)
    if (hooks.length === 0) {
      return
    }

    for (const hook of hooks) {
      try {
        await hook.handle(input, output)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ name: hook.name, timing, err: message }, 'Hook failed')
      }
    }
  }

  async emit<T extends ObserverTiming>(timing: T, input: HookInput<T>): Promise<void> {
    const hooks = this.getSortedObserverHooks(timing)
    if (hooks.length === 0) {
      return
    }

    for (const hook of hooks) {
      try {
        await hook.handle(input)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ name: hook.name, timing, err: message }, 'Hook failed')
      }
    }
  }

  clear(): void {
    for (const timing of HOOK_TIMINGS) {
      this.hooks[timing] = []
    }
    this.disabled.clear()
    logger.debug(`All hooks cleared`)
  }

  // 类型谓词在 filter 阶段完成类型收窄，避免 execute/emit 内部 cast
  private getSortedInterceptorHooks(timing: InterceptorTiming): InterceptorRuntimeHook[] {
    return this.hooks[timing]
      .filter(
        (hook): hook is InterceptorRuntimeHook =>
          hook.kind === 'interceptor' && hook.enabled && !this.disabled.has(hook.name),
      )
      .sort((a, b) => a.priority - b.priority)
  }

  private getSortedObserverHooks(timing: ObserverTiming): ObserverRuntimeHook[] {
    return this.hooks[timing]
      .filter(
        (hook): hook is ObserverRuntimeHook =>
          hook.kind === 'observer' && hook.enabled && !this.disabled.has(hook.name),
      )
      .sort((a, b) => a.priority - b.priority)
  }

  // ── 预设 ──

  private applyPreset(preset: HookPreset): void {
    const hooks = getPresetHooks(preset)
    for (const hook of hooks) {
      this.register(hook)
    }
  }
}

function toHookInfo(hook: HookSpec): RegisteredHookInfo {
  return {
    name: hook.name,
    timing: hook.timing,
    priority: hook.priority,
    enabled: hook.enabled,
  }
}

function getPresetHooks(preset: HookPreset): HookSpec[] {
  switch (preset) {
    case 'default':
      return getDefaultPresetHooks()
    case 'strict':
      return getStrictPresetHooks()
    case 'minimal':
      return getMinimalPresetHooks()
    default:
      return []
  }
}

function getDefaultPresetHooks(): HookSpec[] {
  return [
    createFileGuardHook(),
    createOutputTruncationHook(),
    createLabelTruncatorHook(),
    createThinkingValidatorHook(),
    createAnthropicEffortHook(),
    createFirstMessageVariantHook(),
    createBabysittingHook(),
    createRalphLoopHook(),
    createStreamMetricsHook(),
    createCompactionLoggerHook(),
    createToolErrorTrackerHook(),
    createTokenBudgetHook(),
    createBackgroundStartHook(),
    createBackgroundEndHook(),
  ]
}

function getStrictPresetHooks(): HookSpec[] {
  return [...getDefaultPresetHooks(), createCommentCheckerHook()]
}

function getMinimalPresetHooks(): HookSpec[] {
  return [createFileGuardHook(), createOutputTruncationHook()]
}

export function createHookRegistry(options?: HookRegistryOptions): HookRegistry {
  return new HookRegistry(options)
}
