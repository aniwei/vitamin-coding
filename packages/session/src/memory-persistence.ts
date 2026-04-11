import type {
  PaginatedResult,
  PaginationOptions,
  SessionPersistence,
  SessionSnapshot,
} from './types'

export class InMemorySessionPersistence<T = unknown> implements SessionPersistence<T> {
  private readonly snapshots = new Map<string, SessionSnapshot<T>>()

  async save(snapshot: SessionSnapshot<T>): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot)
  }

  async load(id: string): Promise<SessionSnapshot<T> | null> {
    return this.snapshots.get(id) ?? null
  }

  async delete(id: string): Promise<boolean> {
    return this.snapshots.delete(id)
  }

  async list(): Promise<string[]> {
    return [...this.snapshots.keys()]
  }

  async listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>> {
    const { page, order = 'desc' } = options
    const pageSize = options.pageSize ?? 50

    const all = [...this.snapshots.keys()]
    if (order === 'desc') {
      all.reverse()
    }

    const total = all.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(0, Math.min(page, totalPages - 1))
    const start = safePage * pageSize
    const items = all.slice(start, start + pageSize)

    return {
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasNext: safePage < totalPages - 1,
      hasPrevious: safePage > 0,
    }
  }
}
