// 上下文注入 Hook — 向消息列表注入额外上下文
import type { HookRegistration, MessagesTransformInput, MessagesTransformOutput } from '../../types'

export interface ContextInjectorConfig {
  contextProviders: ContextProvider[]
}

export interface ContextProvider {
  name: string
  getContext: () => string | Promise<string | null> | null
}

export function createContextInjectorHook(
  config: ContextInjectorConfig,
): HookRegistration<'messages.transform'> {
  return {
    name: 'context-injector',
    timing: 'messages.transform',
    priority: 10,
    enabled: true,
    async handler(_input: MessagesTransformInput, output: MessagesTransformOutput): Promise<void> {
      const contexts: string[] = []

      for (const provider of config.contextProviders) {
        try {
          const ctx = await provider.getContext()
          if (ctx) {
            contexts.push(ctx)
          }
        } catch {
          // 上下文提供者失败不阻塞
        }
      }

      if (contexts.length === 0) return

      // 注入系统消息到消息列表头部
      const contextMessage = {
        role: 'system' as const,
        content: contexts.join('\n\n---\n\n'),
      }

      output.messages = [contextMessage as never, ...output.messages]
    },
  }
}
