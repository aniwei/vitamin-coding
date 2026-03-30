// ═══════════════════════════════════════════════════════════
// PlanStore — Plan 持久化存储（Markdown 格式）
// ═══════════════════════════════════════════════════════════
// Plan 以 .plan.md 文件存储。恢复时加载原始 Markdown 由大模型分析推进。

import { randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir, mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { planToMarkdown, markdownToPlan } from './plan-markdown'
import type { Plan, PlanSummary, PlanStatus, PlanTask, PlanStore } from './types'

// ═══ LocalPlanStore（Markdown 文件持久化） ═══

interface LocalPlanStoreOptions {
  /** 存储目录 (e.g. ".vitamin/plans") */
  baseDir: string
}

export class LocalPlanStore implements PlanStore {
  private baseDir: string

  constructor(options: LocalPlanStoreOptions) {
    this.baseDir = options.baseDir
  }

  async create(plan: Plan): Promise<Plan> {
    await this.ensureDir()

    // 同一 sessionId 最多只有一个 active plan；新建时将旧 active 置为 paused
    if (plan.status === 'active') {
      const existing = await this.getActive(plan.sessionId)
      if (existing && existing.id !== plan.id) {
        existing.status = 'paused'
        existing.updatedAt = Date.now()
        await this.writePlan(existing)
      }
    }

    const now = Date.now()
    const saved: Plan = {
      ...plan,
      id: plan.id || randomUUID().slice(0, 8),
      version: 1,
      createdAt: plan.createdAt || now,
      updatedAt: plan.updatedAt || now,
    }
    await this.writePlan(saved)
    return saved
  }

  async get(planId: string): Promise<Plan | undefined> {
    try {
      return await this.readPlan(planId)
    } catch {
      return undefined
    }
  }

  async getMarkdown(planId: string): Promise<string | undefined> {
    try {
      return await readFile(this.planPath(planId), 'utf-8')
    } catch {
      return undefined
    }
  }

  async update(planId: string, patch: Partial<Plan>): Promise<Plan> {
    const plan = await this.readPlan(planId)
    if (!plan) {
      throw new Error(`Plan ${planId} not found`)
    }

    const updated: Plan = {
      ...plan,
      ...patch,
      id: plan.id, // id 不可覆盖
      version: plan.version + 1,
      updatedAt: Date.now(),
    }

    // 更新完成时间
    if (patch.status === 'completed' && !updated.completedAt) {
      updated.completedAt = Date.now()
    }

    await this.writePlan(updated)
    return updated
  }

  async delete(planId: string): Promise<boolean> {
    try {
      await unlink(this.planPath(planId))
      return true
    } catch {
      return false
    }
  }

  async listBySession(sessionId: string): Promise<PlanSummary[]> {
    const plans = await this.readAllPlans()
    return plans
      .filter(p => p.sessionId === sessionId)
      .map(this.toSummary)
  }

  async listByStatus(status: PlanStatus): Promise<PlanSummary[]> {
    const plans = await this.readAllPlans()
    return plans
      .filter(p => p.status === status)
      .map(this.toSummary)
  }

  async getActive(sessionId: string): Promise<Plan | undefined> {
    const plans = await this.readAllPlans()
    return plans.find(p => p.sessionId === sessionId && p.status === 'active')
  }

  async updateTask(planId: string, taskId: string, patch: Partial<PlanTask>): Promise<Plan> {
    const plan = await this.readPlan(planId)
    if (!plan) {
      throw new Error(`Plan ${planId} not found`)
    }

    const taskIndex = plan.tasks.findIndex(t => t.id === taskId)
    if (taskIndex === -1) {
      throw new Error(`Task ${taskId} not found in plan ${planId}`)
    }

    const existing = plan.tasks[taskIndex]
    plan.tasks[taskIndex] = {
      ...existing,
      ...patch,
      id: taskId, // id 不可覆盖
    } as PlanTask
    plan.version += 1
    plan.updatedAt = Date.now()

    // 自动推进 plan 状态: 全部完成 → plan completed
    const allCompleted = plan.tasks.every(
      t => t.status === 'completed' || t.status === 'skipped',
    )
    if (allCompleted && plan.status === 'active') {
      plan.status = 'completed'
      plan.completedAt = Date.now()
    }

    // 自动更新 ready 状态
    this.refreshReadyTasks(plan)

    await this.writePlan(plan)
    return plan
  }

  async getReadyTasks(planId: string): Promise<PlanTask[]> {
    const plan = await this.readPlan(planId)
    if (!plan) return []

    this.refreshReadyTasks(plan)
    return plan.tasks.filter(t => t.status === 'ready')
  }

  async getVersion(planId: string): Promise<number> {
    const plan = await this.readPlan(planId)
    return plan?.version ?? 0
  }

  // ═══ 内部方法 ═══

  /** 刷新 pending → ready（依赖全部完成的 pending 任务自动提升为 ready） */
  private refreshReadyTasks(plan: Plan): void {
    const completed = new Set(
      plan.tasks
        .filter(t => t.status === 'completed' || t.status === 'skipped')
        .map(t => t.id),
    )

    for (const task of plan.tasks) {
      if (task.status !== 'pending') continue
      const deps = task.dependencies ?? []
      if (deps.every(d => completed.has(d))) {
        task.status = 'ready'
      }
    }
  }

  private toSummary(plan: Plan): PlanSummary {
    return {
      id: plan.id,
      name: plan.name,
      status: plan.status,
      taskCount: plan.tasks.length,
      completedCount: plan.tasks.filter(
        t => t.status === 'completed' || t.status === 'skipped',
      ).length,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    }
  }

  private planPath(planId: string): string {
    return join(this.baseDir, `${planId}.plan.md`)
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true })
  }

  private async writePlan(plan: Plan): Promise<void> {
    await this.ensureDir()
    const md = planToMarkdown(plan)
    const target = this.planPath(plan.id)
    const tmp = `${target}.tmp`
    // 原子写入: 写 tmp → rename
    await writeFile(tmp, md, 'utf-8')
    await rename(tmp, target)
  }

  private async readPlan(planId: string): Promise<Plan | undefined> {
    try {
      const md = await readFile(this.planPath(planId), 'utf-8')
      return markdownToPlan(md)
    } catch {
      return undefined
    }
  }

  private async readAllPlans(): Promise<Plan[]> {
    try {
      await this.ensureDir()
      const files = await readdir(this.baseDir)
      const plans: Plan[] = []
      for (const file of files) {
        if (!file.endsWith('.plan.md')) continue
        try {
          const md = await readFile(join(this.baseDir, file), 'utf-8')
          plans.push(markdownToPlan(md))
        } catch {
          // skip corrupt files
        }
      }
      return plans
    } catch {
      return []
    }
  }
}

export function createLocalPlanStore(options: LocalPlanStoreOptions): LocalPlanStore {
  return new LocalPlanStore(options)
}
