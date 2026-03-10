// Plan 格式定义 — Prometheus 生成的计划结构
export interface PlanStep {
  id: string
  title: string
  description: string
  dependencies: string[]
  estimatedMinutes: number
  category?: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled'
}

export interface Plan {
  name: string
  title: string
  description: string
  steps: PlanStep[]
  createdAt: number
  updatedAt: number
  metadata: Record<string, unknown>
}

// Plan → Markdown 序列化（checkbox 清单格式，供 Atlas 读取）
export function planToMarkdown(plan: Plan): string {
  const lines: string[] = [
    `# ${plan.title}`,
    '',
    plan.description,
    '',
    '## Steps',
    '',
  ]

  for (const step of plan.steps) {
    const checkbox = step.status === 'completed' ? '[x]' : '[ ]'
    const deps = step.dependencies.length > 0
      ? ` (depends: ${step.dependencies.join(', ')})`
      : ''
    const estimate = step.estimatedMinutes > 0
      ? ` (~${step.estimatedMinutes}min)`
      : ''

    lines.push(`- ${checkbox} **${step.id}**: ${step.title}${deps}${estimate}`)
    lines.push(`  ${step.description}`)
    lines.push('')
  }

  return lines.join('\n')
}

// Markdown → Plan 反序列化
export function markdownToPlan(name: string, markdown: string): Plan {
  const titleMatch = markdown.match(/^#\s+(.+)/m)
  const title = titleMatch?.[1] ?? name
  const descriptionMatch = markdown.match(/^#\s+.+\n\n(.+?)(?=\n\n##|\n\n-)/s)
  const description = descriptionMatch?.[1]?.trim() ?? ''

  const steps: PlanStep[] = []
  // 两步解析: 先匹配 checkbox 行 + 描述行, 再从 title 行提取 depends 和 estimate
  const linePattern = /- \[([ x])\] \*\*([\w-]+)\*\*:\s*(.+)\n\s+(.+)/g

  let match = linePattern.exec(markdown)
  while (match) {
    const done = match[1]
    const id = match[2] ?? ''
    const titleLine = match[3] ?? ''
    const desc = match[4] ?? ''

    // 从 titleLine 提取 depends 和 estimate
    const depsMatch = titleLine.match(/\(depends:\s*([^)]+)\)/)
    const estimateMatch = titleLine.match(/\(~(\d+)min\)/)

    // 步骤标题 = titleLine 去除 depends 和 estimate 部分
    const cleanTitle = titleLine
      .replace(/\s*\(depends:\s*[^)]+\)/, '')
      .replace(/\s*\(~\d+min\)/, '')
      .trim()

    steps.push({
      id,
      title: cleanTitle,
      description: desc.trim(),
      dependencies: depsMatch?.[1] ? depsMatch[1].split(',').map((d) => d.trim()) : [],
      estimatedMinutes: estimateMatch?.[1] ? Number.parseInt(estimateMatch[1], 10) : 0,
      status: done === 'x' ? 'completed' : 'pending',
    })
    match = linePattern.exec(markdown)
  }

  return {
    name,
    title,
    description,
    steps,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  }
}
