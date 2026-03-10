// Prometheus 自动预研模块 — 收集代码库上下文用于计划生成 (§S14.1 Step 1)

// 预研结果
export interface ResearchResult {
  fileStructure: string[]
  relevantFiles: Array<{ path: string; summary: string }>
  techStack: string[]
  conventions: string[]
  notes: string
}

// 预研提示模板（注入到 Prometheus 的初始上下文）
export function buildResearchPrompt(userRequest: string, projectContext?: string): string {
  const parts: string[] = []

  parts.push('## 预研阶段')
  parts.push('')
  parts.push('在生成计划之前，你必须通过自动预研收集上下文。')
  parts.push('')
  parts.push('### 用户请求')
  parts.push(userRequest)
  parts.push('')

  if (projectContext) {
    parts.push('### 项目上下文（来自 AGENTS.md）')
    parts.push(projectContext)
    parts.push('')
  }

  parts.push('### 预研任务')
  parts.push('1. 使用 `read` 和 `glob` 工具了解项目结构')
  parts.push('2. 识别与用户请求相关的文件')
  parts.push('3. 检查现有测试和规范')
  parts.push('4. 记录潜在的冲突或依赖关系')
  parts.push('')
  parts.push('预研完成后，进入访谈阶段（提问 >= 3 个澄清问题）。')

  return parts.join('\n')
}

// 从 Agent 的工具调用结果中提取研究发现
export function extractResearchFindings(
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>,
): ResearchResult {
  const fileStructure: string[] = []
  const relevantFiles: Array<{ path: string; summary: string }> = []
  const techStack: string[] = []
  const conventions: string[] = []
  const notes: string[] = []

  for (const call of toolCalls) {
    switch (call.name) {
      case 'glob':
      case 'ls': {
        const lines = call.result.split('\n').filter(Boolean)
        fileStructure.push(...lines)
        break
      }
      case 'read': {
        const path = call.args['file_path'] as string | undefined
        if (path) {
          // 提取文件名作为相关文件
          relevantFiles.push({
            path,
            summary: call.result.slice(0, 200),
          })

          // 从 package.json 提取技术栈
          if (path.endsWith('package.json')) {
            try {
              const pkg = JSON.parse(call.result) as Record<string, unknown>
              const deps = {
                ...(pkg['dependencies'] as Record<string, string> | undefined),
                ...(pkg['devDependencies'] as Record<string, string> | undefined),
              }
              techStack.push(...Object.keys(deps).slice(0, 20))
            } catch {
              // 忽略 JSON 解析失败
            }
          }
        }
        break
      }
      case 'grep': {
        notes.push(`grep "${call.args['pattern']}": ${call.result.split('\n').length} matches`)
        break
      }
    }
  }

  return {
    fileStructure: [...new Set(fileStructure)].slice(0, 100),
    relevantFiles: relevantFiles.slice(0, 30),
    techStack: [...new Set(techStack)],
    conventions,
    notes: notes.join('\n'),
  }
}

// 将研究结果格式化为上下文字符串（注入后续阶段）
export function formatResearchContext(result: ResearchResult): string {
  const parts: string[] = ['## 预研笔记']

  if (result.techStack.length > 0) {
    parts.push(`\n### 技术栈\n${result.techStack.join(', ')}`)
  }

  if (result.relevantFiles.length > 0) {
    parts.push('\n### 相关文件')
    for (const file of result.relevantFiles.slice(0, 15)) {
      parts.push(`- ${file.path}`)
    }
  }

  if (result.notes) {
    parts.push(`\n### 备注\n${result.notes}`)
  }

  return parts.join('\n')
}
