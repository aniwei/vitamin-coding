import { parseYamlFrontmatter, serializeYamlFrontmatter } from '@vitamin/manifest'
import { createLogger } from '@vitamin/shared'

import type {
  MemoryType,
  MemoryEntry,
  MemoryEntryMeta,
  LayeredMemoryStoreOptions,
  MemoryConflict,
  MemoryScopeFilter,
} from './types'

const log = createLogger('@vitamin/memory:layered')

const VALID_TYPES = new Set<MemoryType>(['user', 'feedback', 'project', 'reference'])
const INDEX_FILENAME = 'MEMORY.md'

export function parseFrontmatter(raw: string): { meta: MemoryEntryMeta; content: string } | null {
  let parsed: ReturnType<typeof parseYamlFrontmatter>
  try {
    parsed = parseYamlFrontmatter(raw)
  } catch {
    return null
  }

  const fields = parsed.metadata
  const name = readString(fields, 'name')
  const description = readString(fields, 'description')
  const type = readString(fields, 'type') as MemoryType | undefined
  const scope = readString(fields, 'scope') as MemoryEntryMeta['scope'] | undefined
  const team = readString(fields, 'team')

  if (!name || !description || !type || !VALID_TYPES.has(type)) {
    return null
  }

  return {
    meta: {
      name,
      description,
      type,
      ...(scope ? { scope } : {}),
      ...(team ? { team } : {}),
    },
    content: parsed.body.trim(),
  }
}

export function serializeEntry(entry: MemoryEntry): string {
  const fields: Record<string, unknown> = {
    name: entry.name,
    description: entry.description,
    type: entry.type,
  }
  if (entry.scope) {
    fields.scope = entry.scope
  }
  if (entry.team) {
    fields.team = entry.team
  }
  return serializeYamlFrontmatter(fields, entry.content)
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' ? value : undefined
}

export function buildIndexContent(entries: MemoryEntry[]): string {
  if (entries.length === 0) {
    return '# Memory Index\n'
  }

  const lines = ['# Memory Index', '']
  for (const entry of entries) {
    const desc =
      entry.description.length > 120 ? `${entry.description.slice(0, 117)}...` : entry.description
    lines.push(`- [${entry.name}](${entry.filename}) — ${desc}`)
  }
  lines.push('')
  return lines.join('\n')
}

export class LayeredMemoryStore {
  private entries = new Map<string, MemoryEntry>()
  private readonly baseDir: string
  private readonly indexFile: string

  constructor(options: LayeredMemoryStoreOptions) {
    this.baseDir = options.baseDir
    this.indexFile = options.indexFile ?? INDEX_FILENAME
  }

  async load(): Promise<void> {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')

    this.entries.clear()

    let files: string[]
    try {
      files = await readdir(this.baseDir)
    } catch {
      log.debug('Memory directory does not exist yet: %s', this.baseDir)
      return
    }

    const mdFiles = files.filter((f) => f.endsWith('.md') && f !== this.indexFile)

    for (const filename of mdFiles) {
      try {
        const raw = await readFile(join(this.baseDir, filename), 'utf-8')
        const parsed = parseFrontmatter(raw)
        if (parsed) {
          this.entries.set(parsed.meta.name, {
            ...parsed.meta,
            content: parsed.content,
            filename,
          })
        }
      } catch {
        log.warn('Failed to read memory file: %s', filename)
      }
    }

    log.info('Loaded %d memory entries from %s', this.entries.size, this.baseDir)
  }

  async save(entry: MemoryEntry): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { join } = await import('node:path')

    await mkdir(this.baseDir, { recursive: true })

    const filename = entry.filename || `${entry.type}_${sanitizeName(entry.name)}.md`
    const entryWithFilename = { ...entry, filename }

    const filePath = join(this.baseDir, filename)
    await writeFile(filePath, serializeEntry(entryWithFilename), 'utf-8')

    this.entries.set(entry.name, entryWithFilename)
    await this.updateIndex()

    log.info('Saved memory entry: %s (%s)', entry.name, entry.type)
  }

  async delete(name: string): Promise<boolean> {
    const entry = this.entries.get(name)
    if (!entry) {
      return false
    }

    const { unlink } = await import('node:fs/promises')
    const { join } = await import('node:path')

    try {
      await unlink(join(this.baseDir, entry.filename))
    } catch {
      log.warn('Failed to delete memory file: %s', entry.filename)
    }

    this.entries.delete(name)
    await this.updateIndex()

    log.info('Deleted memory entry: %s', name)
    return true
  }

  get(name: string): MemoryEntry | undefined {
    return this.entries.get(name)
  }

  list(filter?: { type?: MemoryType }): MemoryEntry[] {
    const all = [...this.entries.values()]
    if (!filter?.type) {
      return all
    }
    return all.filter((e) => e.type === filter.type)
  }

  listScoped(filter: MemoryScopeFilter): MemoryEntry[] {
    return filterMemoryByScope(this.list(), filter)
  }

  getAll(): ReadonlyMap<string, MemoryEntry> {
    return this.entries
  }

  private async updateIndex(): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { join } = await import('node:path')

    await mkdir(this.baseDir, { recursive: true })

    const sorted = [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name))
    const content = buildIndexContent(sorted)
    await writeFile(join(this.baseDir, this.indexFile), content, 'utf-8')
  }

  clear(): void {
    this.entries.clear()
  }
}

export class InMemoryLayeredStore {
  private entries = new Map<string, MemoryEntry>()

  save(entry: MemoryEntry): void {
    this.entries.set(entry.name, entry)
  }

  delete(name: string): boolean {
    return this.entries.delete(name)
  }

  get(name: string): MemoryEntry | undefined {
    return this.entries.get(name)
  }

  list(filter?: { type?: MemoryType }): MemoryEntry[] {
    const all = [...this.entries.values()]
    if (!filter?.type) {
      return all
    }
    return all.filter((e) => e.type === filter.type)
  }

  listScoped(filter: MemoryScopeFilter): MemoryEntry[] {
    return filterMemoryByScope(this.list(), filter)
  }

  getAll(): ReadonlyMap<string, MemoryEntry> {
    return this.entries
  }

  clear(): void {
    this.entries.clear()
  }
}

export function filterMemoryByScope(
  entries: MemoryEntry[],
  filter: MemoryScopeFilter = {},
): MemoryEntry[] {
  return entries.filter((entry) => {
    if (filter.scopes && filter.scopes.length > 0) {
      const scope = entry.scope ?? entry.type
      if (!filter.scopes.includes(scope as NonNullable<MemoryEntryMeta['scope']>)) {
        return false
      }
    }
    if (filter.team && entry.team && entry.team !== filter.team) {
      return false
    }
    return true
  })
}

export function detectMemoryConflicts(entries: MemoryEntry[]): MemoryConflict[] {
  const conflicts: MemoryConflict[] = []
  const byName = groupBy(entries, (entry) => entry.name)
  const byDescription = groupBy(entries, (entry) => entry.description.toLowerCase())

  for (const [name, grouped] of byName) {
    if (grouped.length > 1) {
      conflicts.push({
        name,
        entries: grouped,
        reason: 'duplicate-name',
        suggested: mergeMemoryEntries(grouped),
      })
    }
  }

  for (const [description, grouped] of byDescription) {
    const names = new Set(grouped.map((entry) => entry.name))
    if (grouped.length > 1 && names.size === grouped.length) {
      conflicts.push({
        name: description,
        entries: grouped,
        reason: 'same-description',
        suggested: mergeMemoryEntries(grouped),
      })
    }
  }

  return conflicts
}

export function mergeMemoryEntries(entries: MemoryEntry[]): MemoryEntry {
  if (entries.length === 0) {
    throw new Error('Cannot merge empty memory entries')
  }
  const first = entries[0]
  if (!first) {
    throw new Error('Cannot merge empty memory entries')
  }
  const content = entries
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .filter((content, index, all) => all.indexOf(content) === index)
    .join('\n\n')

  return {
    ...first,
    content,
    description: first.description,
    filename: first.filename,
  }
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const existing = grouped.get(key) ?? []
    existing.push(item)
    grouped.set(key, existing)
  }
  return grouped
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
}
