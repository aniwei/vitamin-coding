import { FileSessionPersistence } from './file-persistence'
import { RemoteSessionPersistence } from './remote-persistence'
import type { SessionPersistence, StorageOptions } from './types'

 // 根据选项创建 SessionPersistence 实例。
 // @example
 // const storage = createSessionStorage({ type: 'local', baseDir: '/path/to/sessions' })
 // const storage = createSessionStorage({ type: 'remote', baseUrl: 'https://api.vitamin.dev/v1/sessions', getAuth: async () => ({ token: 'xxx' }) })
export function createSessionStorage<T = unknown>(
  options: StorageOptions,
): SessionPersistence<T> {
  switch (options.type) {
    case 'local':
      return new FileSessionPersistence<T>({ directory: options.baseDir! })
    case 'remote':
      return new RemoteSessionPersistence<T>({
        baseUrl: options.baseUrl,
        getAuth: options.getAuth,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs,
      })
    default:
      throw new Error(`Unsupported storage type: ${(options as { type: string }).type}`)
  }
}
