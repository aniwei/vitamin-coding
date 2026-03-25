// @vitamin/memory — L3 Archive (历史归档与恢复)
//
// 被压缩的消息不是"丢弃"，而是"归档"。
// Agent 可以通过 read_file 工具按需回溯完整历史。

import { createLogger } from '@vitamin/shared'
import { messageToText } from './token-estimator'

import type { Message } from '@vitamin/ai'
import type { ArchiveStorage, ArchiveEntry, StorageType } from './types'

const log = createLogger('@vitamin/memory:archive')

// ══════════════════════════════════════════════════════
// InMemoryArchiveStorage — 纯内存实现（测试用）
// ══════════════════════════════════════════════════════

export class InMemoryArchiveStorage implements ArchiveStorage {
  readonly type: StorageType = 'memory'

  private archives = new Map<string, { content: string; entry: ArchiveEntry }>()
  private sessionIndex = new Map<string, string[]>()

  async archive(sessionId: string, messages: Message[], summary: string): Promise<string> {
    const timestamp = Date.now()
    const path = `memory://archives/${sessionId}/compaction-${timestamp}.md`
    const content = formatArchive(messages, summary, timestamp)

    this.archives.set(path, {
      content,
      entry: {
        path,
        timestamp,
        messageCount: messages.length,
        summary: summary.slice(0, 200),
      },
    })

    const index = this.sessionIndex.get(sessionId) ?? []
    index.push(path)
    this.sessionIndex.set(sessionId, index)

    log.info(`Archived ${messages.length} messages for session ${sessionId}`)
    return path
  }

  async read(archivePath: string): Promise<string> {
    const record = this.archives.get(archivePath)
    if (!record) throw new Error(`Archive not found: ${archivePath}`)
    return record.content
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const paths = this.sessionIndex.get(sessionId) ?? []
    return paths
      .map((p) => this.archives.get(p)?.entry)
      .filter((e): e is ArchiveEntry => e !== undefined)
  }
}

// ══════════════════════════════════════════════════════
// LocalArchiveStorage — 本地文件系统实现
// ══════════════════════════════════════════════════════

export class LocalArchiveStorage implements ArchiveStorage {
  readonly type: StorageType = 'local'

  constructor(private readonly baseDir: string) {}

  async archive(sessionId: string, messages: Message[], summary: string): Promise<string> {
    const { join } = await import('node:path')
    const { writeFile, mkdir } = await import('node:fs/promises')

    const timestamp = Date.now()
    const dir = join(this.baseDir, sessionId)
    const filename = `compaction-${timestamp}.md`
    const filePath = join(dir, filename)

    await mkdir(dir, { recursive: true })
    await writeFile(filePath, formatArchive(messages, summary, timestamp), 'utf-8')

    log.info(`Archived ${messages.length} messages → ${filePath}`)
    return filePath
  }

  async read(archivePath: string): Promise<string> {
    const { readFile } = await import('node:fs/promises')
    return readFile(archivePath, 'utf-8')
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const { join } = await import('node:path')
    const { readdir, stat } = await import('node:fs/promises')

    const dir = join(this.baseDir, sessionId)

    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return []
    }

    const entries: ArchiveEntry[] = []
    for (const file of files) {
      if (!file.startsWith('compaction-') || !file.endsWith('.md')) continue

      const filePath = join(dir, file)
      const fileStat = await stat(filePath)
      const timestampMatch = file.match(/compaction-(\d+)\.md/)
      const timestamp = timestampMatch ? Number(timestampMatch[1]) : fileStat.mtimeMs

      entries.push({
        path: filePath,
        timestamp,
        messageCount: 0, // 需要读取文件才能知道
        summary: '',
      })
    }

    return entries.sort((a, b) => a.timestamp - b.timestamp)
  }
}

// ══════════════════════════════════════════════════════
// RemoteArchiveStorage — 远程 HTTP 实现
// ══════════════════════════════════════════════════════

export class RemoteArchiveStorage implements ArchiveStorage {
  readonly type: StorageType = 'remote'

  constructor(private readonly options: {
    baseUrl: string
    getAuth: () => Promise<{ token: string }>
    timeout?: number
    fetch?: typeof globalThis.fetch
  }) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const fetchFn = this.options.fetch ?? globalThis.fetch
    const auth = await this.options.getAuth()
    const url = `${this.options.baseUrl}${path}`

    const response = await fetchFn(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`,
        ...init?.headers,
      },
      signal: init?.signal ?? (this.options.timeout
        ? AbortSignal.timeout(this.options.timeout)
        : undefined),
    })

    if (!response.ok) {
      throw new Error(`Archive API error: ${response.status} ${response.statusText}`)
    }

    return response
  }

  async archive(sessionId: string, messages: Message[], summary: string): Promise<string> {
    const timestamp = Date.now()
    const content = formatArchive(messages, summary, timestamp)

    const response = await this.request(`/archives/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      body: JSON.stringify({ content, summary, messageCount: messages.length, timestamp }),
    })

    const { path } = await response.json() as { path: string }
    log.info(`Archived ${messages.length} messages → ${path}`)
    return path
  }

  async read(archivePath: string): Promise<string> {
    const response = await this.request(`/archives/content?path=${encodeURIComponent(archivePath)}`)
    const { content } = await response.json() as { content: string }
    return content
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const response = await this.request(`/archives/${encodeURIComponent(sessionId)}`)
    const { entries } = await response.json() as { entries: ArchiveEntry[] }
    return entries
  }
}

// ══════════════════════════════════════════════════════
// 工厂函数
// ══════════════════════════════════════════════════════

export function createArchiveStorage(config: import('./types').StorageConfig): ArchiveStorage {
  switch (config.type) {
    case 'local': {
      const baseDir = config.baseDir ?? `${process.env['VITAMIN_HOME'] ?? `${process.env['HOME']}/.vitamin`}/agent/archives`
      return new LocalArchiveStorage(baseDir)
    }
    case 'remote':
      return new RemoteArchiveStorage({
        baseUrl: config.baseUrl,
        getAuth: config.getAuth,
        timeout: config.timeout,
        fetch: config.fetch,
      })
    case 'memory':
      return new InMemoryArchiveStorage()
  }
}

// ══════════════════════════════════════════════════════
// 内部辅助
// ══════════════════════════════════════════════════════

function formatArchive(messages: Message[], summary: string, timestamp: number): string {
  const date = new Date(timestamp).toISOString()
  const parts: string[] = [
    `## Compacted at ${date}`,
    '',
    '### Summary',
    summary,
    '',
    `### Original Messages (${messages.length} messages)`,
  ]

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'Human'
      : msg.role === 'assistant' ? 'Assistant'
      : `Tool[${msg.toolName}]`
    const content = messageToText(msg)
    // 限制单条消息在归档中的长度
    const truncated = content.length > 2000
      ? `${content.slice(0, 2000)}\n...(truncated, ${content.length} chars total)`
      : content
    parts.push(`\n**${role}**: ${truncated}`)
  }

  return parts.join('\n')
}
