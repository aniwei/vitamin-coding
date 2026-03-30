// ═══════════════════════════════════════════════════════════
// TaskType → AgentProfile 路由
// ═══════════════════════════════════════════════════════════

import type { AgentProfileRegistry, PlanTask, RegisteredAgentProfile, TaskType } from './types'

export const TASK_TYPE_PROFILE_MAP: Record<TaskType, string> = {
  code_generation: 'coder',
  code_modification: 'coder',
  refactoring: 'refactorer',
  testing: 'tester',
  debugging: 'debugger',
  research: 'researcher',
  documentation: 'documenter',
  review: 'reviewer',
  infrastructure: 'infra',
  custom: '__fallback__',
}

export function resolveAgentProfileForTask(
  task: PlanTask,
  registry: AgentProfileRegistry,
): RegisteredAgentProfile | undefined {
  // 1. 优先使用 task.execution 中已决议的 agent profile
  if (task.execution?.agentProfile) {
    const explicit = registry.get(task.execution.agentProfile)
    if (explicit) return explicit
  }

  // 2. 按 TaskType → profile 名查表
  const profileName = TASK_TYPE_PROFILE_MAP[task.type]
  const byType = registry.get(profileName)
  if (byType) return byType

  // 3. 尝试 category/capability 路由
  const resolved = registry.resolve({ category: task.type })
  if (resolved) return resolved

  // 4. fallback
  return registry.get('__fallback__')
}
