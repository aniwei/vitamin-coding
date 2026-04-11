import { DiskPersistence } from './disk-persistence'
import type { Persistence, Snapshot, Codec } from './types'

export interface FilePersistenceOptions<T = unknown> {
  baseDir: string
  extension?: string
  codec?: Codec<Snapshot<T>>
}

export class FilePersistence<T = unknown>
  extends DiskPersistence<Snapshot<T>>
  implements Persistence<T>
{
  constructor(options: FilePersistenceOptions<T>) {
    super({ baseDir: options.baseDir, extension: options.extension, codec: options.codec })
  }

  protected extractId(snapshot: Snapshot<T>): string {
    return snapshot.id
  }
}
