import { join } from 'node:path'
import { SESSION_PAGE_SIZE } from '@vitamin/env'
import { 
  readFile, 
  writeFile, 
  readdir, 
  unlink, 
  mkdir, 
  stat 
} from 'node:fs/promises'
import type { 
  PaginatedResult, 
  PaginationOptions, 
  SessionPersistence, 
  SessionSnapshot 
} from './types'

export interface DiskSessionPersistenceOptions {
  path: string
}

export class DiskSessionPersistence<T = unknown> implements SessionPersistence<T> {
  private readonly path: string
  private initialized = false

  constructor(options: DiskSessionPersistenceOptions) {
    this.path = options.path
  }

  async save(snapshot: SessionSnapshot<T>): Promise<void> {
    await this.ensureDir()
    const filePath = this.sessionPath(snapshot.id)
    const data = JSON.stringify(snapshot, null, 2)
    await writeFile(filePath, data, 'utf-8')
  }

  async load(id: string): Promise<SessionSnapshot<T> | null> {
    await this.ensureDir()
    const filePath = this.sessionPath(id)
    try {
      const data = await readFile(filePath, 'utf-8')
      return JSON.parse(data) as SessionSnapshot<T>
    } catch {
      return null
    }
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.sessionPath(id)
    try {
      await unlink(filePath)
      return true
    } catch {
      return false
    }
  }

  async list(): Promise<string[]> {
    await this.ensureDir()
    try {
      const files = await readdir(this.path)
      return files.filter(f => f.endsWith('.session.json')).map(f => f.replace('.session.json', ''))
    } catch {
      return []
    }
  }

  async listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>> {
    await this.ensureDir()
    const { page, sortOrder = 'desc' } = options
    const pageSize = options.pageSize ?? SESSION_PAGE_SIZE

    try {
      const files = await readdir(this.path)
      const sessionFiles = files.filter(f => f.endsWith('.session.json'))

      // 获取文件修改时间用于排序
      const withStats = await Promise.all(
        sessionFiles.map(async (f) => {
          const filePath = join(this.path, f)
          const s = await stat(filePath)
          return { id: f.replace('.session.json', ''), mtime: s.mtimeMs }
        }),
      )

      // 排序（文件系统层面只能按 mtime）
      withStats.sort((a, b) => sortOrder === 'asc' ? a.mtime - b.mtime : b.mtime - a.mtime)

      const total = withStats.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const safePage = Math.max(0, Math.min(page, totalPages - 1))
      const start = safePage * pageSize
      const items = withStats.slice(start, start + pageSize).map(f => f.id)

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

  private sessionPath(id: string): string {
    // 防止路径遍历：移除任何路径分隔符
    const safeId = id.replace(/[/\\:]/g, '_')
    return join(this.path, `${safeId}.session.json`)
  }

  private async ensureDir(): Promise<void> {
    if (this.initialized) return
    await mkdir(this.path, { recursive: true })
    this.initialized = true
  }
}

export function createDiskSessionPersistence<T = unknown>(
  options: DiskSessionPersistenceOptions,
): SessionPersistence<T> {
  return new DiskSessionPersistence<T>(options)
}
