import { RemotePersistence, RemotePersistenceError } from '@vitamin/persistence'
import { SESSION_PAGE_SIZE } from '@vitamin/env'
import type { SessionPersistence, SessionSnapshot } from './types'
import type { HttpSessionPersistenceOptions } from './http-persistence'

export type RemoteSessionPersistenceOptions = HttpSessionPersistenceOptions

export class RemoteSessionPersistence<T = unknown> extends RemotePersistence<SessionSnapshot<T>> implements SessionPersistence<T> {
  constructor(options: RemoteSessionPersistenceOptions) {
    super({
      ...options,
      defaultSortBy: 'lastActiveAt',
      defaultPageSize: SESSION_PAGE_SIZE,
    })
  }

  protected override extractId(snapshot: SessionSnapshot<T>): string {
    return snapshot.id
  }
}

export { RemotePersistenceError }
