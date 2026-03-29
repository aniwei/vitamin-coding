// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — 文件系统 PlanFileStore 实现
// ═══════════════════════════════════════════════════════════
// 基于本地文件系统的 PlanFileStore，路径安全化，自动创建目录

import { join } from 'node:path'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import type { PlanFileStore } from './plan-loader'

export interface FileSystemPlanFileStoreOptions {
  /** 计划文件根目录 */
  directory: string
}

export function createFileSystemPlanFileStore(
  options: FileSystemPlanFileStoreOptions,
): PlanFileStore {
  const dir = options.directory
  let initialized = false

  async function ensureDir(): Promise<void> {
    if (initialized) return
    await mkdir(dir, { recursive: true })
    initialized = true
  }

  function safePath(path: string): string {
    // 防止路径遍历：移除 .. 和绝对路径前缀
    const sanitized = path
      .replace(/\.\./g, '')
      .replace(/^[/\\]+/, '')
      .replace(/[/\\:]/g, '_')
    return join(dir, sanitized)
  }

  return {
    async read(path: string): Promise<string> {
      await ensureDir()
      return readFile(safePath(path), 'utf-8')
    },

    async write(path: string, content: string): Promise<void> {
      await ensureDir()
      await writeFile(safePath(path), content, 'utf-8')
    },

    async exists(path: string): Promise<boolean> {
      try {
        await stat(safePath(path))
        return true
      } catch {
        return false
      }
    },
  }
}
