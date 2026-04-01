import { DiskPersistence } from '@vitamin/persistence'
import { SESSION_PAGE_SIZE } from '@vitamin/env'
import type { 
  SessionPersistence, 
  SessionSnapshot 
} from './types'

export interface FileSessionPersistenceOptions {
  baseDir: string
}

export class FileSessionPersistence<T = unknown> extends DiskPersistence<SessionSnapshot<T>> implements SessionPersistence<T> {
  constructor(options: FileSessionPersistenceOptions) {
    super({
      baseDir: options.baseDir,
      extension: '.session.json',
      defaultPageSize: SESSION_PAGE_SIZE,
    })
  }

  protected override extractId(snapshot: SessionSnapshot<T>): string {
    return snapshot.id
  }
}

export function createFileSessionPersistence<T = unknown>(
  options: FileSessionPersistenceOptions
): SessionPersistence<T> {
  return new FileSessionPersistence<T>(options)
}

export type DiskSessionPersistenceOptions = FileSessionPersistenceOptions

export class DiskSessionPersistence<T = unknown> extends FileSessionPersistence<T> {}

export function createDiskSessionPersistence<T = unknown>(
  options: DiskSessionPersistenceOptions,
): SessionPersistence<T> {
  return new DiskSessionPersistence<T>(options)
}
