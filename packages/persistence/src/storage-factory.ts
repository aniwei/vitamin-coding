import { FilePersistence } from './file-persistence'
import { MemoryPersistence } from './memory-persistence'
import { HttpPersistence } from './http-persistence'
import type { Persistence, StorageOptions } from './types'

export function createPersistence<T = unknown>(
  options: StorageOptions<T>,
): Persistence<T> {
  switch (options.type) {
    case 'file':
      return new FilePersistence<T>({
        baseDir: options.baseDir,
        extension: options.extension,
        codec: options.codec,
      })
    case 'http':
      return new HttpPersistence<T>({
        baseUrl: options.baseUrl,
        getAuth: options.getAuth,
        getHeaders: options.getHeaders,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? 30_000,
        codec: options.codec,
      })
    case 'memory':
      return new MemoryPersistence<T>()
    default:
      throw new Error(`Unsupported storage type: ${(options as { type: string }).type}`)
  }
}
