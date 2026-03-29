// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Checkpoint Store
// ═══════════════════════════════════════════════════════════
// 任务级 checkpoint 持久化：支持进程重启后恢复
// 参照 deepagents / LangGraph 的 checkpointer 方向

import { join } from 'node:path'
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { CHECKPOINT_SNAPSHOT_VERSION } from '@vitamin/env'
import type { OrchestratorTask } from './types'

// ═══ 数据模型 ═══

export interface Checkpoint {
  id: string
  taskId: string
  sessionId?: string
  planId?: string
  stepId?: string
  task: OrchestratorTask
  metadata: Record<string, unknown>
  createdAt: number
}

export interface CheckpointSnapshot {
  version: number
  checkpoint: Checkpoint
}

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>
  get(taskId: string): Promise<Checkpoint | undefined>
  getLatest(planId: string): Promise<Checkpoint | undefined>
  getBySession(sessionId: string): Promise<Checkpoint[]>
  list(filter?: { planId?: string; taskId?: string; sessionId?: string }): Promise<Checkpoint[]>
  remove(id: string): Promise<boolean>
  clear(): Promise<void>
}

// ═══ 内存实现 ═══
export function createMemoryCheckpointStore(): CheckpointStore {
  const checkpoints = new Map<string, Checkpoint>()

  return {
    async save(checkpoint: Checkpoint) {
      checkpoints.set(checkpoint.id, checkpoint)
    },

    async get(taskId: string) {
      for (const cp of checkpoints.values()) {
        if (cp.taskId === taskId) return cp
      }
      return undefined
    },

    async getLatest(planId: string) {
      let latest: Checkpoint | undefined
      for (const cp of checkpoints.values()) {
        if (cp.planId === planId) {
          if (!latest || cp.createdAt > latest.createdAt) {
            latest = cp
          }
        }
      }
      return latest
    },

    async getBySession(sessionId: string) {
      return Array.from(checkpoints.values())
        .filter(cp => cp.sessionId === sessionId)
        .sort((a, b) => a.createdAt - b.createdAt)
    },

    async list(filter) {
      let result = Array.from(checkpoints.values())
      if (filter?.planId) {
        result = result.filter(cp => cp.planId === filter.planId)
      }
      if (filter?.taskId) {
        result = result.filter(cp => cp.taskId === filter.taskId)
      }
      if (filter?.sessionId) {
        result = result.filter(cp => cp.sessionId === filter.sessionId)
      }
      return result.sort((a, b) => a.createdAt - b.createdAt)
    },

    async remove(id: string) {
      return checkpoints.delete(id)
    },

    async clear() {
      checkpoints.clear()
    },
  }
}

// ═══ 文件系统实现 ═══

export interface FileCheckpointStoreOptions {
  directory: string
}

export function createFileCheckpointStore(options: FileCheckpointStoreOptions): CheckpointStore {
  const dir = options.directory
  let initialized = false

  async function ensureDir(): Promise<void> {
    if (initialized) return
    await mkdir(dir, { recursive: true })
    initialized = true
  }

  function cpPath(id: string): string {
    const safeId = id.replace(/[/\\:]/g, '_')
    return join(dir, `${safeId}.checkpoint.json`)
  }

  async function loadAll(): Promise<Map<string, Checkpoint>> {
    await ensureDir()
    const map = new Map<string, Checkpoint>()
    try {
      const files = await readdir(dir)
      for (const file of files.filter(f => f.endsWith('.checkpoint.json'))) {
        try {
          const data = await readFile(join(dir, file), 'utf-8')
          const snapshot = JSON.parse(data) as CheckpointSnapshot
          map.set(snapshot.checkpoint.id, snapshot.checkpoint)
        } catch {
          // 跳过损坏的文件
        }
      }
    } catch {
      // 目录不存在或读取失败
    }
    return map
  }

  return {
    async save(checkpoint: Checkpoint) {
      await ensureDir()
      const snapshot: CheckpointSnapshot = {
        version: CHECKPOINT_SNAPSHOT_VERSION,
        checkpoint,
      }
      await writeFile(cpPath(checkpoint.id), JSON.stringify(snapshot, null, 2), 'utf-8')
    },

    async get(taskId: string) {
      const all = await loadAll()
      for (const cp of all.values()) {
        if (cp.taskId === taskId) return cp
      }
      return undefined
    },

    async getLatest(planId: string) {
      const all = await loadAll()
      let latest: Checkpoint | undefined
      for (const cp of all.values()) {
        if (cp.planId === planId) {
          if (!latest || cp.createdAt > latest.createdAt) {
            latest = cp
          }
        }
      }
      return latest
    },

    async getBySession(sessionId: string) {
      const all = await loadAll()
      return Array.from(all.values())
        .filter(cp => cp.sessionId === sessionId)
        .sort((a, b) => a.createdAt - b.createdAt)
    },

    async list(filter) {
      const all = await loadAll()
      let result = Array.from(all.values())
      if (filter?.planId) {
        result = result.filter(cp => cp.planId === filter.planId)
      }
      if (filter?.taskId) {
        result = result.filter(cp => cp.taskId === filter.taskId)
      }
      if (filter?.sessionId) {
        result = result.filter(cp => cp.sessionId === filter.sessionId)
      }
      return result.sort((a, b) => a.createdAt - b.createdAt)
    },

    async remove(id: string) {
      try {
        await unlink(cpPath(id))
        return true
      } catch {
        return false
      }
    },

    async clear() {
      await ensureDir()
      try {
        const files = await readdir(dir)
        for (const file of files.filter(f => f.endsWith('.checkpoint.json'))) {
          await unlink(join(dir, file))
        }
      } catch {
        // 忽略清理失败
      }
    },
  }
}
