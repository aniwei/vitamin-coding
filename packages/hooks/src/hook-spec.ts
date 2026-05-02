import type { HookHandle, HookTiming, InterceptorTiming } from './types'

// handle 签名在存储层统一擦除为 unknown，避免泛型传染到 HookRegistry
type BaseRuntimeHook = {
  name: string
  timing: HookTiming
  priority: number
  enabled: boolean
}

export type ObserverRuntimeHook = BaseRuntimeHook & {
  kind: 'observer'
  handle: (input: unknown) => void | Promise<void>
}

export type InterceptorRuntimeHook = BaseRuntimeHook & {
  kind: 'interceptor'
  handle: (input: unknown, output: unknown) => void | Promise<void>
}

// 非泛型存储类型，factory 和 registerAll 统一使用，消除 HookRegistry 上的泛型压力
export type HookSpec = ObserverRuntimeHook | InterceptorRuntimeHook

// 与 HookPayloadMap 中 output 非 void 的 timing 保持一致
// 新增拦截器 timing 时需同步更新此列表
export const INTERCEPTOR_TIMINGS = new Set<HookTiming>([
  'chat.message.before',
  'chat.message.after',
  'tool.execute.before',
  'tool.execute.after',
  'messages.transform',
  'chat.params',
  'system-prompt.sections.transform',
  'system-prompt.transform',
] satisfies InterceptorTiming[])

/**
 * 所有 as 强转集中在此处：HookHandle<T> 因函数参数逆变无法自动赋给 (unknown) => void。
 * factory 函数通过 timing 字面量驱动 handle 的类型推断，调用侧零 cast。
 */
export function defineHook<T extends HookTiming>(config: {
  name: string
  timing: T
  handle: HookHandle<T>
  priority?: number
  enabled?: boolean
}): HookSpec {
  const base: BaseRuntimeHook = {
    name: config.name,
    timing: config.timing,
    priority: config.priority ?? 50,
    enabled: config.enabled ?? true,
  }

  if (INTERCEPTOR_TIMINGS.has(config.timing)) {
    return {
      ...base,
      kind: 'interceptor',
      handle: config.handle as InterceptorRuntimeHook['handle'],
    }
  }

  return {
    ...base,
    kind: 'observer',
    handle: config.handle as ObserverRuntimeHook['handle'],
  }
}
