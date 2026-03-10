import { createLogger } from '@vitamin/shared'
import type { HookHandler, HookInput, HookOutput, HookRegistration, HookTiming } from './types'

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
]

interface RuntimeHook {
  name: string
  timing: HookTiming
  priority: number
  enabled: boolean
  run: (input: unknown, output: unknown) => void | Promise<void>
  emit: (input: unknown) => void | Promise<void>
}

export interface RegisteredHookInfo {
  name: string
  timing: HookTiming
  priority: number
  enabled: boolean
}

function createHookBuckets(): Record<HookTiming, RuntimeHook[]> {
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
  }
}

export class HookRegistry {
  private readonly hooks = createHookBuckets()
  private readonly disabled = new Set<string>()

  // 注册 Hook
  register<T extends HookTiming>(registration: HookRegistration<T>): void {
    const run = (input: unknown, output: unknown): void | Promise<void> => {
      const handler = registration.handler as HookHandler<T>
      return handler(input as HookInput<T>, output as HookOutput<T>)
    }

    const emit = (input: unknown): void | Promise<void> => {
      const handler = registration.handler as (input: HookInput<T>) => void | Promise<void>
      return handler(input as HookInput<T>)
    }

    const list = this.hooks[registration.timing]
    list.push({
      name: registration.name,
      timing: registration.timing,
      priority: registration.priority,
      enabled: registration.enabled,
      run,
      emit,
    })

    logger.debug(`Hook registered: ${registration.name} (timing=${registration.timing}, priority=${registration.priority})`)
  }

  // 注销 Hook
  unregister(name: string): boolean {
    let removed = false
    for (const timing of HOOK_TIMINGS) {
      const list = this.hooks[timing]
      const filtered = list.filter((hook) => hook.name !== name)
      
      if (filtered.length < list.length) {
        this.hooks[timing] = filtered
        removed = true
        
        logger.debug(`Hook unregistered: ${name} (timing=${timing})`)
      }
    }
    return removed
  }

  // 运行时禁用 Hook
  disable(name: string): void {
    this.disabled.add(name)
    logger.debug(`Hook disabled: ${name}`)
  }

  // 运行时启用 Hook
  enable(name: string): void {
    this.disabled.delete(name)
    logger.debug(`Hook enabled: ${name}`)
  }

  // 查询指定时机已注册的 Hook
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

  // 执行有输出的 Hook 链（链式处理）
  async execute<T extends HookTiming>(
    timing: T,
    input: HookInput<T>,
    output: HookOutput<T>,
  ): Promise<void> {
    const hooks = this.getSortedHooks(timing)
    if (hooks.length === 0) return

    for (const hook of hooks) {
      try {
        await hook.run(input, output)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Hook ${hook.name} (timing=${timing}) failed: ${message}`)
      }
    }
  }

  // 执行无输出的 Hook (event 类型)
  async emit<T extends HookTiming>(
    timing: T,
    input: HookInput<T>,
  ): Promise<void> {
    const hooks = this.getSortedHooks(timing)
    if (hooks.length === 0) return

    for (const hook of hooks) {
      try {
        await hook.emit(input)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Hook ${hook.name} (timing=${timing}) failed: ${message}`)
      }
    }
  }

  // 清空所有 Hook
  clear(): void {
    for (const timing of HOOK_TIMINGS) {
      this.hooks[timing] = []
    }
    this.disabled.clear()
    logger.debug(`All hooks cleared`)
  }

  // 按 priority 排序，排除已禁用的 Hook
  private getSortedHooks<T extends HookTiming>(timing: T): RuntimeHook[] {
    const list = this.hooks[timing]

    return list
      .filter((hook) => hook.enabled && !this.disabled.has(hook.name))
      .sort((a, b) => a.priority - b.priority)
  }
}

function toHookInfo(hook: RuntimeHook): RegisteredHookInfo {
  return {
    name: hook.name,
    timing: hook.timing,
    priority: hook.priority,
    enabled: hook.enabled,
  }
}

export function createHookRegistry(): HookRegistry {
  return new HookRegistry()
}
