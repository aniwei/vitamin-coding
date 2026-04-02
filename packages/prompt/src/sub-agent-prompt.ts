export interface AgentProfile {
  name: string
  taskTypes: string[]
  capabilities: string[]
  systemPromptTemplate: string
  defaultTools?: string[]
  preferredModelTier?: string
  defaultMaxToolTurns?: number
}

export interface SubAgentPromptContext {
  taskTitle?: string
  taskDescription?: string
  taskFiles?: string[]
}

const PROFILE_TOOL_NAME_ALIASES: Record<string, string[]> = {
  file_read: ['read'],
  file_write: ['write'],
  file_edit: ['edit'],
  shell: ['bash'],
  search: ['ls', 'find', 'grep'],
}

function buildContextReplacements(context: SubAgentPromptContext): Record<string, string> {
  return {
    '{task_title}': context.taskTitle ?? '未提供',
    '{task_description}': context.taskDescription ?? '未提供',
    '{task_files}': context.taskFiles?.join(', ') ?? '未提供',
  }
}

/**
 * 根据 agent profile 和任务上下文组装子 agent 的系统提示词。
 * 替换 `{task_*}` 占位符。
 */
export function assembleSubAgentPrompt(
  profile: AgentProfile,
  context: SubAgentPromptContext = {},
): string {
  let prompt = profile.systemPromptTemplate

  const replacements = buildContextReplacements(context)

  for (const [placeholder, value] of Object.entries(replacements)) {
    prompt = prompt.replaceAll(placeholder, value)
  }

  return prompt
}

export function assembleGenericSubAgentPrompt(
  agentName: string,
  context: SubAgentPromptContext = {},
): string {
  const replacements = buildContextReplacements(context)

  return [
    `你是 Vitamin 体系中的子代理“${agentName}”。`,
    '你只负责执行一个边界明确的子任务，不直接与用户对话，不负责整体规划，也不要继续委派其他子代理。',
    '',

    '## 当前任务',
    `- 标题：${replacements['{task_title}']}`,
    `- 描述：${replacements['{task_description}']}`,
    `- 文件范围：${replacements['{task_files}']}`,
    '',
    '## 执行要求',
    '- 聚焦当前任务，不要扩展范围。',
    '- 优先阅读相关代码，再做修改。',
    '- 完成后给出简洁结论，并说明是否仍有风险或阻塞。',
  ].join('\n')
}

export function resolveAgentToolNames(defaultTools?: string[]): string[] {
  if (!defaultTools || defaultTools.length === 0) return []

  const resolved = new Set<string>()
  for (const name of defaultTools) {
    const aliases = PROFILE_TOOL_NAME_ALIASES[name]
    if (aliases && aliases.length > 0) {
      for (const alias of aliases) {
        resolved.add(alias)
      }
      continue
    }
    resolved.add(name)
  }

  return [...resolved]
}

/**
 * 从 agent-profiles 数据中查找匹配的 profile。
 * 优先按 name 精确匹配，其次按 capabilities 模糊匹配。
 */
export function resolveAgentProfile(
  profiles: AgentProfile[],
  agentName: string,
): AgentProfile | undefined {
  // 精确匹配
  const exact = profiles.find(p => p.name === agentName)
  if (exact) return exact

  // 模糊匹配：兼容 quality-reviewer / spec-reviewer / explore 等别名场景
  const lower = agentName.toLowerCase()
  return profiles.find(p =>
    lower.endsWith(p.name.toLowerCase()) ||
    p.capabilities.some(c => lower.includes(c.toLowerCase())) ||
    p.taskTypes.some(t => lower.includes(t.toLowerCase())),
  )
}
