// FileSystem Session Persistence — 基于文件系统的会话持久化
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionPersistence, SessionSnapshot } from './types'

export interface FileSessionPersistenceOptions {
  /** 存储目录路径 */
  directory: string
}

export class FileSessionPersistence<T = unknown> implements SessionPersistence<T> {
  private readonly dir: string
  private initialized = false

  constructor(options: FileSessionPersistenceOptions) {
    this.dir = options.directory
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
      const files = await readdir(this.dir)
      return files
        .filter((f) => f.endsWith('.session.json'))
        .map((f) => f.replace('.session.json', ''))
    } catch {
      return []
    }
  }

  private sessionPath(id: string): string {
    // 防止路径遍历：移除任何路径分隔符
    const safeId = id.replace(/[/\\:]/g, '_')
    return join(this.dir, `${safeId}.session.json`)
  }

  private async ensureDir(): Promise<void> {
    if (this.initialized) return
    await mkdir(this.dir, { recursive: true })
    this.initialized = true
  }
}

export function createFileSessionPersistence<T = unknown>(
  options: FileSessionPersistenceOptions,
): SessionPersistence<T> {
  return new FileSessionPersistence<T>(options)
}
