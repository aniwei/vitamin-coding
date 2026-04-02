import { LocalPromptProvider } from './local-provider'
import { RemotePromptProvider } from './remote-provider'
import type { PromptProvider, PromptProviderOptions } from './types'

/**
 * 根据选项创建对应的 PromptProvider 实例
 * 模式与 persistence 包的 createPersistence 一致
 */
export function createPromptProvider(options: PromptProviderOptions): PromptProvider {
  switch (options.type) {
    case 'local':
      return new LocalPromptProvider({
        baseDir: options.baseDir,
        extension: options.extension,
      })
    case 'remote':
      return new RemotePromptProvider({
        baseUrl: options.baseUrl,
        getAuth: options.getAuth,
        getHeaders: options.getHeaders,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs,
      })
    default:
      throw new Error(`Unknown prompt provider type: ${(options as { type: string }).type}`)
  }
}
