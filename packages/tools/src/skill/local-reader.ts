import { readFile, readdir, realpath } from 'node:fs/promises'
import { join, basename, dirname, resolve } from 'node:path'
import type { SkillReader, SkillEntry, SkillContent, SkillSource } from './types'

const SKILL_FILENAME = 'SKILL.md'
const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])

export interface LocalSkillReaderOptions {
  // 要扫描的目录列表 
  directories: Array<{ path: string; source: SkillSource }>
  // 最大递归深度，默认 5
  maxDepth?: number
}

export class LocalSkillReader implements SkillReader {
  private directories: Array<{ path: string; source: SkillSource }>
  private maxDepth: number
  private seenRealPaths = new Set<string>()

  constructor(options: LocalSkillReaderOptions) {
    this.directories = options.directories
    this.maxDepth = options.maxDepth ?? 5
  }

  async discover(): Promise<SkillEntry[]> {
    const entries: SkillEntry[] = []
    this.seenRealPaths.clear()

    for (const dir of this.directories) {
      const absPath = resolve(dir.path)
      await this.scan(absPath, dir.source, entries, 0)
    }

    return entries
  }

  async read(entry: SkillEntry): Promise<SkillContent | null> {
    try {
      const content = await readFile(entry.location, 'utf-8')
      return {
        content,
        location: entry.location,
        directory: dirname(entry.location),
        source: entry.source,
      }
    } catch {
      return null
    }
  }

  // 递归扫描目录：
  // - 包含 SKILL.md → 作为 Skill 根，不再递归
  // - 否则 → 收集根级 .md + 递归子目录
  private async scan(
    dirPath: string,
    source: SkillSource,
    entries: SkillEntry[],
    depth: number,
  ): Promise<void> {
    if (depth > this.maxDepth) return

    let dirEntries
    try {
      dirEntries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    const hasSkillMd = dirEntries.some(e => e.isFile() && e.name === SKILL_FILENAME)

    if (hasSkillMd) {
      const filePath = join(dirPath, SKILL_FILENAME)

      if (await this.dedup(filePath)) {
        entries.push({ location: filePath, source })
      }

      return
    }

    for (const entry of dirEntries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue

      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(dirPath, entry.name)
        if (await this.dedup(filePath)) {
          entries.push({ location: filePath, source })
        }
      } else if (entry.isDirectory()) {
        await this.scan(join(dirPath, entry.name), source, entries, depth + 1)
      }
    }
  }

  // 符号链接去重 — 返回 true 表示首次看到
  private async dedup(filePath: string): Promise<boolean> {
    let real: string
    try {
      real = await realpath(filePath)
    } catch {
      real = filePath
    }
    if (this.seenRealPaths.has(real)) return false
    this.seenRealPaths.add(real)
    return true
  }
}

// 从文件路径推导 Skill 名称
// - SKILL.md → 用父目录名
// - other.md → 用文件名（去后缀）
export function deriveSkillName(filePath: string): string {
  const filename = basename(filePath)
  if (filename === SKILL_FILENAME) {
    return basename(dirname(filePath))
  }

  return filename.replace(/\.md$/i, '')
}
