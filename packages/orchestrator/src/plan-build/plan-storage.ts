// Plan Storage — .vitamin/plans/ 文件管理
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'

import type { Plan } from '../agents/prometheus/plan-format'
import { planToMarkdown, markdownToPlan } from '../agents/prometheus/plan-format'

const PLANS_DIR = '.vitamin/plans'

export interface PlanStorage {
  save(plan: Plan): Promise<string>
  load(name: string): Promise<Plan | undefined>
  list(): Promise<string[]>
  remove(name: string): Promise<boolean>
  update(plan: Plan): Promise<void>
  getPlansDir(): string
}

// 创建 Plan 存储实例
export function createPlanStorage(projectRoot: string): PlanStorage {
  const plansDir = join(projectRoot, PLANS_DIR)

  return {
    async save(plan: Plan): Promise<string> {
      await mkdir(plansDir, { recursive: true })
      const filename = sanitizePlanName(plan.name)
      const filePath = join(plansDir, `${filename}.md`)
      const content = planToMarkdown(plan)
      await writeFile(filePath, content, 'utf-8')
      return filePath
    },

    async load(name: string): Promise<Plan | undefined> {
      const filename = sanitizePlanName(name)
      const filePath = join(plansDir, `${filename}.md`)

      try {
        const exists = await stat(filePath).then(() => true).catch(() => false)
        if (!exists) return undefined
        const content = await readFile(filePath, 'utf-8')
        return markdownToPlan(name, content)
      } catch {
        return undefined
      }
    },

    async list(): Promise<string[]> {
      try {
        const files = await readdir(plansDir)
        return files
          .filter((f) => f.endsWith('.md'))
          .map((f) => basename(f, '.md'))
      } catch {
        return []
      }
    },

    async remove(name: string): Promise<boolean> {
      const filename = sanitizePlanName(name)
      const filePath = join(plansDir, `${filename}.md`)
      try {
        await unlink(filePath)
        return true
      } catch {
        return false
      }
    },

    async update(plan: Plan): Promise<void> {
      await mkdir(plansDir, { recursive: true })
      const filename = sanitizePlanName(plan.name)
      const filePath = join(plansDir, `${filename}.md`)
      const updated: Plan = { ...plan, updatedAt: Date.now() }
      const content = planToMarkdown(updated)
      await writeFile(filePath, content, 'utf-8')
    },

    getPlansDir(): string {
      return plansDir
    },
  }
}

// 清理计划名称为安全的文件名
function sanitizePlanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}
