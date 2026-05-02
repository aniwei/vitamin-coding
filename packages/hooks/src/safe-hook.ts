import { createLogger } from '@x-mars/shared'

import type { HookSpec } from './hook-spec'

const logger = createLogger('@x-mars/hooks:safe-hook')

// factory 抛出时捕获错误并返回 null，避免单个 Hook 初始化失败影响整体
export function safeCreateHook(
  name: string,
  factory: () => HookSpec,
  options: { enabled: boolean },
): HookSpec | null {
  if (!options.enabled) {
    return null
  }
  try {
    return factory()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error({ name, err: message }, 'Hook creation failed')
    return null
  }
}

export function isHookEnabled(hookName: string, disabledHooks: string[]): boolean {
  return !disabledHooks.includes(hookName)
}

export function safeHookEnabled(hookName: string, disabledHooks: string[]): boolean {
  return isHookEnabled(hookName, disabledHooks)
}
