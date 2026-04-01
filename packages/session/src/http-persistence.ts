import { HttpPersistence, RemotePersistenceError } from '@vitamin/persistence'
import type { SessionSnapshot } from './types'

export interface HttpSessionPersistenceOptions {
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch: typeof globalThis.fetch
  timeoutMs: number
}

export class HttpSessionPersistence<T = unknown> extends HttpPersistence<SessionSnapshot<T>> {
  constructor(options: HttpSessionPersistenceOptions) {
    super(options)
  }
}

export { RemotePersistenceError }
