// ═══════════════════════════════════════════════════════════
// @vitamin/orchestrator — Plan Run (计划执行态)
// ═══════════════════════════════════════════════════════════
// PlanDefinition (markdown) 是可共享的计划定义，PlanRun 是某次执行实例。
// PlanRun 与 sessionId 关联，支持恢复、暂停、跨端同步。

import { join } from 'node:path'
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { PLAN_RUN_SNAPSHOT_VERSION } from '@vitamin/env'
import type { PlanStep } from './plan-loader'

// ═══ 数据模型 ═══

export type PlanRunStatus = 'active' | 'paused' | 'completed' | 'failed'

export interface PlanRunStepState {
  stepId: string
  status: PlanStep['status']
  /** 步骤输出摘要 */
  output?: string
  /** 对应的任务 ID */
  taskId?: string
  /** ReviewGate 结果 */
  reviewPassed?: boolean
  updatedAt: number
}

export interface PlanRun {
  id: string
  /** 引用的计划定义 ID（对应 PlanFile.id） */
  planId: string
  /** 计划定义文件路径（用于重新加载） */
  planPath: string
  /** 关联的 session ID */
  sessionId: string
  status: PlanRunStatus
  /** 每个步骤的执行状态 */
  stepStates: PlanRunStepState[]
  /** 当前正在执行的 step（可能为 undefined 表示没有在执行） */
  currentStepId?: string
  startedAt: number
  lastActiveAt: number
  completedAt?: number
  metadata?: Record<string, unknown>
}

export interface PlanRunSnapshot {
  version: number
  run: PlanRun
}

// ═══ PlanRunStore 接口 ═══

export interface PlanRunStore {
  save(run: PlanRun): Promise<void>
  get(runId: string): Promise<PlanRun | undefined>
  getBySession(sessionId: string): Promise<PlanRun[]>
  getByPlan(planId: string): Promise<PlanRun[]>
  getActive(planId: string, sessionId: string): Promise<PlanRun | undefined>
  list(): Promise<PlanRun[]>
  remove(runId: string): Promise<boolean>
}

// ═══ 内存实现 ═══

export function createMemoryPlanRunStore(): PlanRunStore {
  const runs = new Map<string, PlanRun>()

  return {
    async save(run: PlanRun) {
      runs.set(run.id, run)
    },

    async get(runId: string) {
      return runs.get(runId)
    },

    async getBySession(sessionId: string) {
      return Array.from(runs.values()).filter(r => r.sessionId === sessionId)
    },

    async getByPlan(planId: string) {
      return Array.from(runs.values()).filter(r => r.planId === planId)
    },

    async getActive(planId: string, sessionId: string) {
      for (const run of runs.values()) {
        if (run.planId === planId && run.sessionId === sessionId && run.status === 'active') {
          return run
        }
      }
      return undefined
    },

    async list() {
      return Array.from(runs.values())
    },

    async remove(runId: string) {
      return runs.delete(runId)
    },
  }
}

// ═══ 文件系统实现 ═══

export interface FilePlanRunStoreOptions {
  directory: string
}

export function createFilePlanRunStore(options: FilePlanRunStoreOptions): PlanRunStore {
  const dir = options.directory
  let initialized = false

  async function ensureDir(): Promise<void> {
    if (initialized) return
    await mkdir(dir, { recursive: true })
    initialized = true
  }

  function runPath(id: string): string {
    const safeId = id.replace(/[/\\:]/g, '_')
    return join(dir, `${safeId}.run.json`)
  }

  async function loadAll(): Promise<PlanRun[]> {
    await ensureDir()
    try {
      const files = await readdir(dir)
      const runFiles = files.filter(f => f.endsWith('.run.json'))
      const runs: PlanRun[] = []
      for (const file of runFiles) {
        try {
          const data = await readFile(join(dir, file), 'utf-8')
          const snapshot = JSON.parse(data) as PlanRunSnapshot
          runs.push(snapshot.run)
        } catch {
          // 跳过损坏的文件
        }
      }
      return runs
    } catch {
      return []
    }
  }

  return {
    async save(run: PlanRun) {
      await ensureDir()
      const snapshot: PlanRunSnapshot = {
        version: PLAN_RUN_SNAPSHOT_VERSION,
        run,
      }
      await writeFile(runPath(run.id), JSON.stringify(snapshot, null, 2), 'utf-8')
    },

    async get(runId: string) {
      await ensureDir()
      try {
        const data = await readFile(runPath(runId), 'utf-8')
        const snapshot = JSON.parse(data) as PlanRunSnapshot
        return snapshot.run
      } catch {
        return undefined
      }
    },

    async getBySession(sessionId: string) {
      const all = await loadAll()
      return all.filter(r => r.sessionId === sessionId)
    },

    async getByPlan(planId: string) {
      const all = await loadAll()
      return all.filter(r => r.planId === planId)
    },

    async getActive(planId: string, sessionId: string) {
      const all = await loadAll()
      return all.find(
        r => r.planId === planId && r.sessionId === sessionId && r.status === 'active',
      )
    },

    async list() {
      return loadAll()
    },

    async remove(runId: string) {
      try {
        await unlink(runPath(runId))
        return true
      } catch {
        return false
      }
    },
  }
}

// ═══ 辅助函数 ═══

/** 从 PlanFile 步骤列表创建初始 PlanRun */
export function createPlanRun(opts: {
  planId: string
  planPath: string
  sessionId: string
  steps: Array<{ id: string; status: PlanStep['status'] }>
  metadata?: Record<string, unknown>
}): PlanRun {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    planId: opts.planId,
    planPath: opts.planPath,
    sessionId: opts.sessionId,
    status: 'active',
    stepStates: opts.steps.map(s => ({
      stepId: s.id,
      status: s.status,
      updatedAt: now,
    })),
    startedAt: now,
    lastActiveAt: now,
    metadata: opts.metadata,
  }
}

/** 更新 PlanRun 中某个步骤的状态 */
export function updatePlanRunStep(
  run: PlanRun,
  stepId: string,
  update: Partial<Omit<PlanRunStepState, 'stepId'>>,
): PlanRun {
  return {
    ...run,
    lastActiveAt: Date.now(),
    stepStates: run.stepStates.map(s =>
      s.stepId === stepId
        ? { ...s, ...update, updatedAt: Date.now() }
        : s,
    ),
  }
}

/** 检查 PlanRun 是否所有步骤都已完成 */
export function isPlanRunCompleted(run: PlanRun): boolean {
  return run.stepStates.length > 0
    && run.stepStates.every(s => s.status === 'completed')
}

/** 获取 PlanRun 下一个待执行步骤 */
export function getNextPlanRunStep(run: PlanRun): PlanRunStepState | undefined {
  return run.stepStates.find(s => s.status === 'pending')
}
