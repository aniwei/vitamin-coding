import { FileSessionPersistence } from './file-persistence'
import { RemoteSessionPersistence } from './remote-persistence'
import type { SessionPersistence, StorageOptions } from './types'

 // 根据选项创建 SessionPersistence 实例。
 // @example
 // const storage = createSessionStorage({ type: 'local', sessionDir: '/path/to/sessions' })
 // const storage = createSessionStorage({ type: 'remote', remoteUrl: 'https://api.vitamin.dev/v1/sessions', getAuth: async () => ({ token: 'xxx' }) })
export function createSessionStorage<T = unknown>(
  options: StorageOptions,
): SessionPersistence<T> {
  switch (options.type) {
    case 'local':
      return new FileSessionPersistence<T>({ directory: options.sessionDir })
    case 'remote':
      return new RemoteSessionPersistence<T>({
        baseUrl: options.remoteUrl,
        getAuth: options.getAuth,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs,
      })
    default:
      throw new Error(`Unsupported storage type: ${(options as { type: string }).type}`)
  }
}
