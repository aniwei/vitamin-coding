// RemoteSkillReader — 远程 HTTP(S) Skill 读取器

import type { SkillReader, SkillEntry, SkillContent } from './types'

export interface RemoteSkillEntry {
  // 远程 SKILL.md 的完整 URL
  url: string
  // 可选 Skill 名称（用于 fallback）
  name?: string
}

export interface RemoteSkillReaderOptions {
  // 远程 Skill 列表
  entries: RemoteSkillEntry[]
  // HTTP 请求超时（毫秒），默认 10000 
  timeout?: number
  // 自定义请求头
  headers?: Record<string, string>
}

export class RemoteSkillReader implements SkillReader {
  private entries: RemoteSkillEntry[]
  private timeout: number
  private headers: Record<string, string>

  constructor(options: RemoteSkillReaderOptions) {
    this.entries = options.entries
    this.timeout = options.timeout ?? 10_000
    this.headers = options.headers ?? {}
  }

  async discover(): Promise<SkillEntry[]> {
    return this.entries.map((e) => ({
      location: e.url,
      source: 'remote' as const,
    }))
  }

  async read(entry: SkillEntry): Promise<SkillContent | null> {
    // 校验 URL 协议，仅允许 http/https
    let url: URL
    try {
      url = new URL(entry.location)
    } catch {
      return null
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(entry.location, {
        signal: controller.signal,
        headers: this.headers,
      })

      clearTimeout(timer)

      if (!response.ok) return null

      const content = await response.text()
      const directory = deriveRemoteDirectory(entry.location)

      return {
        content,
        location: entry.location,
        directory,
        source: 'remote',
      }
    } catch {
      return null
    }
  }
}

// 从 URL 推导 "目录" — 取 URL 最后一段之前的路径
// 如 https://example.com/skills/react/SKILL.md → https://example.com/skills/react
function deriveRemoteDirectory(urlStr: string): string {
  const lastSlash = urlStr.lastIndexOf('/')
  return lastSlash > 0 ? urlStr.slice(0, lastSlash) : urlStr
}
