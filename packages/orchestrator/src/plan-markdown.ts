// ═══════════════════════════════════════════════════════════
// Plan Markdown 序列化/反序列化
// ═══════════════════════════════════════════════════════════
// Plan 以 Markdown 文件持久化，YAML frontmatter 存储元数据，
// 正文即 LLM 可直接阅读的计划文本。恢复时加载整个 Markdown 交给大模型继续分析推进。

import type {
  Plan,
  PlanTask,
  PlanTaskStatus,
  PlanTaskOutput,
  PlanTaskError,
  PlanStatus,
  TaskType,
} from './types'

// ═══ Serializer: Plan → Markdown ═══

export function planToMarkdown(plan: Plan): string {
  const lines: string[] = []

  // YAML frontmatter（供代码层索引）
  lines.push('---')
  lines.push(`id: ${plan.id}`)
  lines.push(`version: ${plan.version}`)
  lines.push(`name: ${plan.name}`)
  lines.push(`status: ${plan.status}`)
  lines.push(`sessionId: ${plan.sessionId}`)
  lines.push(`createdAt: ${plan.createdAt}`)
  lines.push(`updatedAt: ${plan.updatedAt}`)
  if (plan.completedAt) lines.push(`completedAt: ${plan.completedAt}`)
  lines.push('---')
  lines.push('')

  // Title
  lines.push(`# ${plan.name}`)
  lines.push('')

  // Goal
  lines.push('## Goal')
  lines.push('')
  lines.push(plan.goal)
  lines.push('')

  // Architecture (optional)
  if (plan.architecture) {
    lines.push('## Architecture')
    lines.push('')
    lines.push(plan.architecture)
    lines.push('')
  }

  // Constraints (optional)
  if (plan.constraints?.length) {
    lines.push('## Constraints')
    lines.push('')
    for (const c of plan.constraints) {
      lines.push(`- ${c}`)
    }
    lines.push('')
  }

  // Tasks
  lines.push('## Tasks')
  lines.push('')

  for (const task of plan.tasks) {
    lines.push(taskToMarkdown(task))
  }

  return lines.join('\n')
}

function taskToMarkdown(task: PlanTask): string {
  const lines: string[] = []

  lines.push(`### ${task.id}: ${task.title} [${task.status}]`)
  lines.push('')
  lines.push(`- Type: ${task.type}`)
  if (task.estimatedComplexity) lines.push(`- Complexity: ${task.estimatedComplexity}`)
  if (task.files?.length) lines.push(`- Files: ${task.files.join(', ')}`)
  lines.push(`- Dependencies: ${task.dependencies?.length ? task.dependencies.join(', ') : 'none'}`)
  lines.push(`- Attempts: ${task.attempts}`)
  if (task.startedAt) lines.push(`- Started: ${new Date(task.startedAt).toISOString()}`)
  if (task.completedAt) lines.push(`- Completed: ${new Date(task.completedAt).toISOString()}`)
  lines.push('')
  lines.push(task.description)

  if (task.output) {
    lines.push('')
    lines.push(`> **Output:** ${task.output.summary}`)
    if (task.output.text) {
      for (const outputLine of task.output.text.split('\n')) {
        lines.push(`> ${outputLine}`)
      }
    }
  }

  if (task.error) {
    lines.push('')
    lines.push(`> **Error** [${task.error.code}]: ${task.error.message}`)
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines.join('\n')
}

// ═══ Parser: Markdown → Plan ═══

export function markdownToPlan(markdown: string): Plan {
  const { frontmatter, body } = splitFrontmatter(markdown)
  const fm = parseFrontmatterFields(frontmatter)

  const sections = parseTopSections(body)
  const tasks = parseTasksSection(sections.tasks ?? '')

  // Constraints: lines starting with "- "
  const constraints = sections.constraints
    ? sections.constraints
        .split('\n')
        .filter(l => l.startsWith('- '))
        .map(l => l.slice(2))
    : undefined

  return {
    id: fm.id ?? '',
    version: Number(fm.version) || 1,
    name: fm.name ?? '',
    goal: sections.goal?.trim() ?? '',
    architecture: sections.architecture?.trim() || undefined,
    constraints: constraints?.length ? constraints : undefined,
    tasks,
    status: (fm.status ?? 'draft') as PlanStatus,
    sessionId: fm.sessionId ?? '',
    createdAt: Number(fm.createdAt) || 0,
    updatedAt: Number(fm.updatedAt) || 0,
    completedAt: fm.completedAt ? Number(fm.completedAt) : undefined,
  }
}

// ═══ Internal parsing helpers ═══

function splitFrontmatter(md: string): { frontmatter: string; body: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: '', body: md }
  return { frontmatter: match[1]!, body: match[2] ?? '' }
}

function parseFrontmatterFields(fm: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of fm.split('\n')) {
    const idx = line.indexOf(': ')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 2).trim()
    if (key) fields[key] = value
  }
  return fields
}

/**
 * 按 ## 标题拆分正文，返回 { goal, architecture, constraints, tasks } 等。
 * ### 开头的行不会触发拆分——它们是 tasks 子内容。
 */
function parseTopSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {}
  let currentKey = ''
  let currentLines: string[] = []

  for (const line of body.split('\n')) {
    // 仅 ## 级别（exactly two #）触发新 section
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      if (currentKey) {
        sections[currentKey] = currentLines.join('\n').trim()
      }
      currentKey = line.slice(3).trim().toLowerCase()
      currentLines = []
    } else if (currentKey) {
      currentLines.push(line)
    }
  }
  if (currentKey) {
    sections[currentKey] = currentLines.join('\n').trim()
  }

  return sections
}

function parseTasksSection(tasksBody: string): PlanTask[] {
  if (!tasksBody.trim()) return []

  // Split on ### headers
  const parts: string[] = []
  let current = ''

  for (const line of tasksBody.split('\n')) {
    if (line.startsWith('### ')) {
      if (current.trim()) parts.push(current.trim())
      current = line + '\n'
    } else {
      current += line + '\n'
    }
  }
  if (current.trim()) parts.push(current.trim())

  return parts.map(parseOneTask)
}

function parseOneTask(section: string): PlanTask {
  const lines = section.split('\n')

  const headerLine = lines[0] ?? ''
  const headerMatch = headerLine.match(/^###\s+(\S+):\s+(.+?)\s+\[(\w+)\]\s*$/)
  const id = headerMatch?.[1] ?? ''
  const title = headerMatch?.[2] ?? ''
  const status = (headerMatch?.[3] ?? 'pending') as PlanTaskStatus

  const meta: Record<string, string> = {}
  const descLines: string[] = []
  let output: PlanTaskOutput | undefined
  let error: PlanTaskError | undefined

  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()

    if (trimmed === '---' || trimmed === '') continue

    // Metadata line: - Key: value
    if (trimmed.startsWith('- ') && trimmed.indexOf(': ', 2) !== -1) {
      const colonIdx = trimmed.indexOf(': ', 2)
      const key = trimmed.slice(2, colonIdx).toLowerCase()
      const value = trimmed.slice(colonIdx + 2)
      meta[key] = value
    }
    // Output block
    else if (trimmed.startsWith('> **Output:**')) {
      output = { summary: trimmed.replace('> **Output:**', '').trim() }
    } else if (output && trimmed.startsWith('> ') && !trimmed.startsWith('> **Error**')) {
      output.text = (output.text ? output.text + '\n' : '') + trimmed.slice(2)
    }
    // Error block
    else if (trimmed.startsWith('> **Error**')) {
      const m = trimmed.match(/> \*\*Error\*\*\s*\[([^\]]*)\]:\s*(.*)/)
      if (m) error = { code: m[1]!, message: m[2]! }
    }
    // Description
    else {
      descLines.push(lines[i]!)
    }
  }

  const depsStr = meta.dependencies ?? ''
  const deps = depsStr === 'none' || !depsStr
    ? undefined
    : depsStr.split(',').map(d => d.trim()).filter(Boolean)

  const filesStr = meta.files ?? ''
  const files = filesStr
    ? filesStr.split(',').map(f => f.trim()).filter(Boolean)
    : undefined

  return {
    id,
    title,
    description: descLines.join('\n').trim(),
    type: (meta.type ?? 'custom') as TaskType,
    status,
    dependencies: deps,
    files,
    estimatedComplexity: meta.complexity as PlanTask['estimatedComplexity'],
    attempts: Number(meta.attempts) || 0,
    startedAt: meta.started ? new Date(meta.started).getTime() : undefined,
    completedAt: meta.completed ? new Date(meta.completed).getTime() : undefined,
    output,
    error,
  }
}
