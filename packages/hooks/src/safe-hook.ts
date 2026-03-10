import { createLogger } from '@vitamin/shared'

import type { HookRegistration, HookTiming } from './types'

const logger = createLogger('@vitamin/hooks:safe-hook')

export function safeCreateHook<T extends HookTiming>(
  name: string,
  factory: () => HookRegistration<T>,
  options: { enabled: boolean },
): HookRegistration<T> | null {
  if (!options.enabled) return null
  try {
    return factory()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Hook ${name} creation failed: ${message}`)
    return null
  }
}

// 检查 Hook 是否在配置中启用
export function isHookEnabled(hookName: string, disabledHooks: string[]): boolean {
  return !disabledHooks.includes(hookName)
}

// 兼容旧命名
export const safeHookEnabled = isHookEnabled
