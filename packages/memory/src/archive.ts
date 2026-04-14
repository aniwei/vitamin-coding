import { join } from 'node:path'
import { writeFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { createLogger } from '@vitamin/shared'
import { messageToText } from './token-estimator'

import type { Message } from '@vitamin/ai'
import type { ArchiveStorage, ArchiveEntry, StorageType, StorageOptions } from './types'

const logger = createLogger('@vitamin/memory:archive')

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
        summary: summary.slice(0, 200),
        messageCount: messages.length,
      },
    })

    const index = this.sessionIndex.get(sessionId) ?? []
    index.push(path)
    this.sessionIndex.set(sessionId, index)

    logger.info(`Archived ${messages.length} messages for session ${sessionId}`)
    return path
  }

  async read(archivePath: string): Promise<string> {
    const record = this.archives.get(archivePath)
    if (!record) {
      throw new Error(`Archive not found: ${archivePath}`)
    }
    return record.content
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const paths = this.sessionIndex.get(sessionId) ?? []
    return paths
      .map((p) => this.archives.get(p)?.entry)
      .filter((e): e is ArchiveEntry => e !== undefined)
  }
}

export class LocalArchiveStorage implements ArchiveStorage {
  readonly type: StorageType = 'file'

  constructor(private readonly baseDir: string) {}

  async archive(sessionId: string, messages: Message[], summary: string): Promise<string> {
    const timestamp = Date.now()
    const dir = join(this.baseDir, sessionId)
    const filename = `compaction-${timestamp}.md`
    const path = join(dir, filename)

    await mkdir(dir, { recursive: true })
    await writeFile(path, formatArchive(messages, summary, timestamp), 'utf-8')

    logger.info(`Archived ${messages.length} messages → ${path}`)
    return path
  }

  async read(archivePath: string): Promise<string> {
    return readFile(archivePath, 'utf-8')
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const dir = join(this.baseDir, sessionId)

    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return []
    }

    const entries: ArchiveEntry[] = []
    for (const file of files) {
      if (!file.startsWith('compaction-') || !file.endsWith('.md')) {
        continue
      }

      const path = join(dir, file)
      const fileStat = await stat(path)
      const timestampMatch = file.match(/compaction-(\d+)\.md/)
      const timestamp = timestampMatch ? Number(timestampMatch[1]) : fileStat.mtimeMs

      entries.push({
        path,
        timestamp,
        messageCount: 0, // 需要读取文件才能知道
        summary: '',
      })
    }

    return entries.sort((a, b) => a.timestamp - b.timestamp)
  }
}

export class HttpArchiveStorage implements ArchiveStorage {
  readonly type: StorageType = 'http'

  constructor(
    private readonly options: {
      baseUrl: string
      getAuth: () => Promise<{ token: string }>
      timeout?: number
      fetch?: typeof globalThis.fetch
    },
  ) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const fetchFn = this.options.fetch ?? globalThis.fetch
    const auth = await this.options.getAuth()
    const url = `${this.options.baseUrl}${path}`

    const response = await fetchFn(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        ...init?.headers,
      },
      signal:
        init?.signal ??
        (this.options.timeout ? AbortSignal.timeout(this.options.timeout) : undefined),
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

    const { path } = (await response.json()) as { path: string }
    logger.info(`Archived ${messages.length} messages → ${path}`)

    return path
  }

  async read(archivePath: string): Promise<string> {
    const response = await this.request(`/archives/content?path=${encodeURIComponent(archivePath)}`)
    const { content } = (await response.json()) as { content: string }
    return content
  }

  async list(sessionId: string): Promise<ArchiveEntry[]> {
    const response = await this.request(`/archives/${encodeURIComponent(sessionId)}`)
    const { entries } = (await response.json()) as { entries: ArchiveEntry[] }
    return entries
  }
}

export function createArchiveStorage(options: StorageOptions): ArchiveStorage {
  switch (options.type) {
    case 'file': {
      const baseDir =
        options.baseDir ??
        `${process.env['VITAMIN_HOME'] ?? `${process.env['HOME']}/.vitamin`}/agent/archives`
      return new LocalArchiveStorage(baseDir)
    }

    case 'http':
      return new HttpArchiveStorage({
        baseUrl: options.baseUrl,
        getAuth: options.getAuth,
        timeout: options.timeoutMs,
        fetch: options.fetch,
      })
    case 'memory':
      return new InMemoryArchiveStorage()
    default:
      throw new Error(
        `Unsupported archive storage type: ${String((options as { type: string }).type)}`,
      )
  }
}

export function formatArchive(messages: Message[], summary: string, timestamp: number): string {
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
    const role =
      msg.role === 'user'
        ? 'Human'
        : msg.role === 'assistant'
          ? 'Assistant'
          : `Tool[${msg.toolName}]`

    const content = messageToText(msg)

    // 限制单条消息在归档中的长度
    const truncated =
      content.length > 2000
        ? `${content.slice(0, 2000)}\n...(truncated, ${content.length} chars total)`
        : content

    parts.push(`\n**${role}**: ${truncated}`)
  }

  return parts.join('\n')
}
