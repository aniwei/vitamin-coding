import { join } from 'node:path'
import {
  readFile,
  writeFile,
  readdir,
  unlink,
  mkdir,
  stat,
  rename,
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PersistenceError } from './errors'
import type { PaginatedResult, Codec } from './types'

export interface DiskPersistenceOptions<S = unknown> {
  baseDir: string
  extension?: string
  defaultPageSize?: number
  codec?: Codec<S>
}

export abstract class DiskPersistence<S> {
  protected readonly baseDir: string
  protected readonly extension: string
  protected readonly defaultPageSize: number
  protected readonly codec: Codec<S>
  private initialized = false

  constructor(options: DiskPersistenceOptions<S>) {
    this.baseDir = options.baseDir
    this.extension = options.extension ?? '.json'
    this.defaultPageSize = options.defaultPageSize ?? 20
    this.codec = options.codec ?? {
      encode: (snapshot: S) => JSON.stringify(snapshot),
      decode: (payload: string) => JSON.parse(payload) as S,
      contentType: 'application/json',
    }
  }

  protected abstract extractId(snapshot: S): string

  async save(snapshot: S): Promise<void> {
    await this.ensureDir()

    const filePath = this.resolvePath(this.extractId(snapshot))
    const data = this.codec.encode(snapshot)

    const tmpPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(tmpPath, data, 'utf-8')
    await rename(tmpPath, filePath)
  }

  async load(id: string): Promise<S | null> {
    await this.ensureDir()
    const filePath = this.resolvePath(id)

    try {
      const data = await readFile(filePath, 'utf-8')
      return this.codec.decode(data)
    } catch (error) {
      if (isEnoent(error)) return null
      throw new PersistenceError(`Failed to load "${id}"`, { cause: error })
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.resolvePath(id))
      return true
    } catch {
      return false
    }
  }

  async list(): Promise<string[]> {
    await this.ensureDir()

    try {
      const files = await readdir(this.baseDir)
      return files
        .filter((f) => f.endsWith(this.extension))
        .map((f) => decodeURIComponent(f.slice(0, -this.extension.length)))
    } catch {
      return []
    }
  }

  async listPaginated(options: {
    page: number
    pageSize?: number
    sortBy?: string
    order?: 'asc' | 'desc'
  }): Promise<PaginatedResult<string>> {
    await this.ensureDir()
    const { page, order = 'desc' } = options
    const pageSize = options.pageSize ?? this.defaultPageSize

    try {
      const files = await readdir(this.baseDir)
      const matched = files.filter((f) => f.endsWith(this.extension))

      const withStats = await Promise.all(
        matched.map(async (f) => {
          const filePath = join(this.baseDir, f)
          const s = await stat(filePath)
          return { id: decodeURIComponent(f.slice(0, -this.extension.length)), mtime: s.mtimeMs }
        }),
      )

      withStats.sort((a, b) =>
        order === 'asc' ? a.mtime - b.mtime : b.mtime - a.mtime,
      )

      const total = withStats.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const safePage = Math.max(0, Math.min(page, totalPages - 1))
      const start = safePage * pageSize
      const items = withStats.slice(start, start + pageSize).map((f) => f.id)

      return {
        items,
        total,
        page: safePage,
        pageSize,
        totalPages,
        hasNext: safePage < totalPages - 1,
        hasPrevious: safePage > 0,
      }
    } catch {
      return {
        items: [],
        total: 0,
        page: 0,
        pageSize,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }
    }
  }

  private resolvePath(id: string): string {
    const safeId = encodeURIComponent(id)
    return join(this.baseDir, `${safeId}${this.extension}`)
  }

  private async ensureDir(): Promise<void> {
    if (this.initialized) return

    await mkdir(this.baseDir, { recursive: true })
    this.initialized = true
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ENOENT'
}
