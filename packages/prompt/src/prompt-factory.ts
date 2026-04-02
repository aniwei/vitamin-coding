import { LocalPromptProvider } from './local-provider'
import { RemotePromptProvider } from './remote-provider'
import type { PromptProvider, PromptProviderOptions } from './types'

/**
 * Create the corresponding PromptProvider instance based on options.
 * Pattern is consistent with createPersistence in the persistence package.
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
