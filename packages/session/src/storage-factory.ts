import { FileSessionPersistence } from './file-persistence'
import { RemoteSessionPersistence } from './remote-persistence'
import type { SessionPersistence, StorageOptions } from './types'

 
export function createSessionStorage<T = unknown>(
  options: StorageOptions,
): SessionPersistence<T> {
  switch (options.type) {
    case 'local':
    case 'file':
      return new FileSessionPersistence<T>({ 
        baseDir: options.baseDir 
      })
    case 'remote':
    case 'http':
      return new RemoteSessionPersistence<T>({
        baseUrl: options.baseUrl,
        getAuth: options.getAuth,
        getHeaders: options.getHeaders,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? 30_000,
      })
    default:
      throw new Error(`Unsupported storage type: ${(options as { type: string }).type}`)
  }
}
