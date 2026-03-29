// Markdown 计划文件加载、task/chunk 提取、prompt 注入
import {
  createGfmProcessor,
  getNodeText,
  extractBoldLabels,
  extractInlineCodes,
  countChecks,
} from '@vitamin/shared'
import type { MdastNode } from '@vitamin/shared'

// ═══ 数据模型 ═══

export interface PlanStep {
  id: string
  title: string
  body: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  files?: string[]
}

export interface PlanFile {
  id: string
  name: string
  goal: string
  architecture: string
  steps: PlanStep[]
  rawContent: string
  filePath?: string
}

export interface PlanFileStore {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
}

// ═══ remark processor ═══

const processor = createGfmProcessor()

// ═══ 解析 ═══

export function parsePlanFile(content: string, filePath?: string): PlanFile {
  const tree = processor.parse(content) as MdastNode
  const children = tree.children ?? []

  let name = ''
  let goal = ''
  let architecture = ''
  const steps: PlanStep[] = []

  // 从第一个 h1 提取计划名称
  for (const node of children) {
    if (node.type === 'heading' && node.depth === 1) {
      name = getNodeText(node).replace(/Implementation Plan$/i, '').trim()
      break
    }
  }

  // 从 **Goal:** / **Architecture:** 段落提取元信息
  for (const node of children) {
    for (const labeled of extractBoldLabels(node)) {
      const key = labeled.label.toLowerCase()
      if (key === 'goal') goal = labeled.rest
      else if (key === 'architecture') architecture = labeled.rest
    }
  }

  // 按 h3 标题切分步骤区段
  const stepSections: { heading: MdastNode; nodes: MdastNode[] }[] = []
  let currentSection: { heading: MdastNode; nodes: MdastNode[] } | undefined

  for (const node of children) {
    if (node.type === 'heading' && node.depth === 3) {
      currentSection = { heading: node, nodes: [] }
      stepSections.push(currentSection)
    } else if (currentSection) {
      currentSection.nodes.push(node)
    }
  }

  // 解析每个步骤区段
  let stepCounter = 0
  for (const section of stepSections) {
    stepCounter++
    const headingText = getNodeText(section.heading)

    // 从标题文本提取任务编号和标题
    const taskMatch = headingText.match(/^Task\s+(\d+):\s*(.+)$/i)
    const id = taskMatch ? `step-${taskMatch[1]}` : `step-${stepCounter}`
    const title = taskMatch ? taskMatch[2]!.trim() : headingText.trim()

    // 提取文件列表：找到 **Files:** 段落后的 list 中的 inlineCode
    const files: string[] = []
    for (let i = 0; i < section.nodes.length; i++) {
      const labels = extractBoldLabels(section.nodes[i]!)
      if (labels.some(l => l.label.toLowerCase() === 'files')) {
        const nextNode = section.nodes[i + 1]
        if (nextNode?.type === 'list' && nextNode.children) {
          for (const item of nextNode.children) {
            if (item.type === 'listItem' && typeof item.checked !== 'boolean') {
              files.push(...extractInlineCodes(item))
            }
          }
        }
        break
      }
    }

    // 统计 checkbox（task list items）勾选情况
    let totalChecks = 0
    let checkedCount = 0
    for (const node of section.nodes) {
      if (node.type === 'list' && node.children) {
        const counts = countChecks(node.children)
        totalChecks += counts.total
        checkedCount += counts.checked
      }
    }

    // 推导步骤状态
    let status: PlanStep['status'] = 'pending'
    if (totalChecks > 0 && checkedCount === totalChecks) {
      status = 'completed'
    } else if (checkedCount > 0) {
      status = 'in_progress'
    }

    // body：从标题结束位置到区段最后一个节点结束位置的原始文本
    const startOffset = section.heading.position?.end?.offset
    const sectionEnd = section.nodes.length > 0
      ? section.nodes[section.nodes.length - 1]!.position?.end?.offset
      : startOffset
    const body = startOffset !== undefined && sectionEnd !== undefined
      ? content.slice(startOffset, sectionEnd).trim()
      : ''

    steps.push({ id, title, body, status, files })
  }

  const id = filePath
    ? filePath.replace(/^.*\//, '').replace(/\.md$/, '')
    : `plan-${Date.now()}`

  return {
    id,
    name: name || id,
    goal,
    architecture,
    steps,
    rawContent: content,
    filePath,
  }
}

// ═══ 步骤状态更新 ═══

export function updateStepStatus(
  plan: PlanFile,
  stepId: string,
  status: PlanStep['status'],
): PlanFile {
  return {
    ...plan,
    steps: plan.steps.map(s =>
      s.id === stepId ? { ...s, status } : s,
    ),
  }
}

// ═══ 下一个待执行步骤 ═══

export function getNextPendingStep(plan: PlanFile): PlanStep | undefined {
  return plan.steps.find(s => s.status === 'pending')
}

// ═══ 计划完成检测 ═══

export function isPlanCompleted(plan: PlanFile): boolean {
  return plan.steps.length > 0 && plan.steps.every(s => s.status === 'completed')
}

// ═══ Prompt 注入 ═══

export function buildStepPrompt(plan: PlanFile, step: PlanStep): string {
  const progress = plan.steps.filter(s => s.status === 'completed').length
  const total = plan.steps.length
  const remaining = total - progress - 1 // exclude current

  const parts: string[] = [
    `## Plan: ${plan.name}`,
    `Goal: ${plan.goal}`,
    '',
    `Progress: ${progress}/${total} steps completed, ${remaining} remaining after this one.`,
    '',
    `## Current Task: ${step.title}`,
    '',
    step.body,
  ]

  if (step.files && step.files.length > 0) {
    parts.push('', `Files involved: ${step.files.join(', ')}`)
  }

  return parts.join('\n')
}

// ═══ Plan Loader ═══

export interface PlanLoader {
  load(path: string): Promise<PlanFile>
  save(plan: PlanFile): Promise<void>
  getStep(planId: string, stepId: string): PlanStep | undefined
  getNextStep(planId: string): PlanStep | undefined
  updateStep(planId: string, stepId: string, status: PlanStep['status']): void
  isCompleted(planId: string): boolean
  getPlan(planId: string): PlanFile | undefined
  listPlans(): PlanFile[]
}

export function createPlanLoader(store: PlanFileStore): PlanLoader {
  const plans = new Map<string, PlanFile>()

  return {
    async load(path: string) {
      const content = await store.read(path)
      const plan = parsePlanFile(content, path)
      plans.set(plan.id, plan)
      return plan
    },

    async save(plan: PlanFile) {
      if (plan.filePath) {
        // Rebuild markdown with updated checkbox status
        let content = plan.rawContent
        for (const step of plan.steps) {
          if (step.status === 'completed') {
            // Replace unchecked boxes in this step's body with checked
            const stepBody = step.body
            const updated = stepBody.replace(/^- \[ \]/gm, '- [x]')
            if (updated !== stepBody) {
              content = content.replace(stepBody, updated)
            }
          }
        }
        await store.write(plan.filePath, content)
      }
      plans.set(plan.id, plan)
    },

    getStep(planId: string, stepId: string) {
      return plans.get(planId)?.steps.find(s => s.id === stepId)
    },

    getNextStep(planId: string) {
      const plan = plans.get(planId)
      return plan ? getNextPendingStep(plan) : undefined
    },

    updateStep(planId: string, stepId: string, status: PlanStep['status']) {
      const plan = plans.get(planId)
      if (plan) {
        plans.set(planId, updateStepStatus(plan, stepId, status))
      }
    },

    isCompleted(planId: string) {
      const plan = plans.get(planId)
      return plan ? isPlanCompleted(plan) : false
    },

    getPlan(planId: string) {
      return plans.get(planId)
    },

    listPlans() {
      return Array.from(plans.values())
    },
  }
}
