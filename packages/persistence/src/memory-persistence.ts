import type { PaginatedResult, PaginationOptions, Persistence, Snapshot } from './types'

const DEFAULT_PAGE_SIZE = 20

export class MemoryPersistence<T = unknown> implements Persistence<T> {
  private readonly store = new Map<string, Snapshot<T>>()

  async save(snapshot: Snapshot<T>): Promise<void> {
    this.store.set(snapshot.id, structuredClone(snapshot))
  }

  async load(id: string): Promise<Snapshot<T> | null> {
    const snapshot = this.store.get(id)
    return snapshot ? structuredClone(snapshot) : null
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id)
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  async listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>> {
    const { page, order = 'desc', sortBy = 'updatedAt' } = options
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

    const entries = Array.from(this.store.entries()).map(([id, snapshot]) => ({
      id,
      sortValue: snapshot.metadata[sortBy],
    }))

    entries.sort((a, b) =>
      order === 'asc' ? a.sortValue - b.sortValue : b.sortValue - a.sortValue,
    )

    const total = entries.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(0, Math.min(page, totalPages - 1))
    const start = safePage * pageSize
    const items = entries.slice(start, start + pageSize).map((e) => e.id)

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
