import { RemotePersistence } from './remote-persistence'
import type { Persistence, Snapshot, Codec } from './types'

export interface HttpPersistenceOptions<T = unknown> {
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch: typeof globalThis.fetch
  timeoutMs: number
  codec?: Codec<Snapshot<T>>
}

export class HttpPersistence<T = unknown> extends RemotePersistence<Snapshot<T>> implements Persistence<T> {
  constructor(options: HttpPersistenceOptions<T>) {
    super({ ...options })
  }

  protected extractId(snapshot: Snapshot<T>): string {
    return snapshot.id
  }
}
