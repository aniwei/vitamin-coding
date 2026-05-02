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
    '{task_title}': context.taskTitle ?? 'not provided',
    '{task_description}': context.taskDescription ?? 'not provided',
    '{task_files}': context.taskFiles?.join(', ') ?? 'not provided',
  }
}

/**
 * Assemble the system prompt for a sub-agent based on agent profile and task context.
 * Replaces `{task_*}` placeholders.
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
    `You are a sub-agent "${agentName}" in the X-Mars system.`,
    'You are responsible for executing one clearly scoped sub-task. Do not interact with users directly, handle overall planning, or further delegate to other sub-agents.',
    '',

    '## Current Task',
    `- Title: ${replacements['{task_title}']}`,
    `- Description: ${replacements['{task_description}']}`,
    `- File scope: ${replacements['{task_files}']}`,
    '',
    '## Execution Requirements',
    '- Stay focused on the current task; do not expand scope.',
    '- Read relevant code before making changes.',
    '- After completion, provide a concise conclusion and note any remaining risks or blockers.',
  ].join('\n')
}

export function resolveAgentToolNames(defaultTools?: string[]): string[] {
  if (!defaultTools || defaultTools.length === 0) {
    return []
  }

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
 * Find the matching profile from agent-profiles data.
 * Prefers exact match by name, then fuzzy match by capabilities.
 */
export function resolveAgentProfile(
  profiles: AgentProfile[],
  agentName: string,
): AgentProfile | undefined {
  // 精确匹配
  const exact = profiles.find((p) => p.name === agentName)
  if (exact) {
    return exact
  }

  // 模糊匹配：支持 quality-reviewer / spec-reviewer / explore 等别名形式
  const lower = agentName.toLowerCase()
  return profiles.find(
    (p) =>
      lower.endsWith(p.name.toLowerCase()) ||
      p.capabilities.some((c) => lower.includes(c.toLowerCase())) ||
      p.taskTypes.some((t) => lower.includes(t.toLowerCase())),
  )
}
