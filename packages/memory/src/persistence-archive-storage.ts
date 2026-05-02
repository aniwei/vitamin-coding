import { createLogger } from '@x-mars/shared'
import { formatArchive } from './archive'
import { createPersistence } from '@x-mars/persistence'

import type { Message } from '@x-mars/ai'
import type { Persistence, Snapshot, StorageOptions } from '@x-mars/persistence'
import type { ArchiveStorage, ArchiveEntry, StorageType } from './types'

const logger = createLogger('@x-mars/memory:persistence-archive')

const ARCHIVE_SNAPSHOT_VERSION = 1

export interface ArchiveRecord {
  sessionId: string
  content: string
  summary: string
  messageCount: number
}

export class PersistenceBackedArchiveStorage implements ArchiveStorage {
  readonly type: StorageType

  constructor(
    private readonly persistence: Persistence<ArchiveRecord>,
    type: StorageType = 'file',
  ) {
    this.type = type
  }

  async archive(sessionId: string, messages: Message[], summary: string): Promise<string> {
    const timestamp = Date.now()
    const id = `${sessionId}/compaction-${timestamp}`
    const content = formatArchive(messages, summary, timestamp)

    const snapshot: Snapshot<ArchiveRecord> = {
      version: ARCHIVE_SNAPSHOT_VERSION,
      id,
      data: {
        sessionId,
        content,
        summary: summary.slice(0, 200),
        messageCount: messages.length,
      },
      metadata: {
        createdAt: timestamp,
        updatedAt: timestamp,
        tags: [sessionId],
      },
    }

    await this.persistence.save(snapshot)
    logger.info(`Archived ${messages.length} messages for session ${sessionId}`)
    return id
  }

  async read(archivePath: string): Promise<string> {
    const snapshot = await this.persistence.load(archivePath)
    if (!snapshot) {
      throw new Error(`Archive not found: ${archivePath}`)
    }
    return snapshot.data.content
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const ids = await this.persistence.list()
    const entries: ArchiveEntry[] = []

    for (const id of ids) {
      const snapshot = await this.persistence.load(id)
      if (snapshot && snapshot.data.sessionId === sessionId) {
        entries.push({
          path: id,
          timestamp: snapshot.metadata.createdAt,
          messageCount: snapshot.data.messageCount,
          summary: snapshot.data.summary,
        })
      }
    }

    return entries.sort((a, b) => a.timestamp - b.timestamp)
  }
}

export function createPersistenceArchiveStorage(
  options: StorageOptions<ArchiveRecord>,
): PersistenceBackedArchiveStorage {
  const persistence = createPersistence<ArchiveRecord>(options)
  return new PersistenceBackedArchiveStorage(persistence, options.type)
}
