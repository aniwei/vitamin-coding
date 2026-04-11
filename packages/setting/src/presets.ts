import agentProfiles from './data/agent-profiles.json' with { type: 'json' }
import copilotModels from './data/copilot-models.json' with { type: 'json' }
import anthropicModels from './data/anthropic-models.json' with { type: 'json' }
import taskTypeProfileMap from './data/task-type-profile-map.json' with { type: 'json' }

/**
 * 与 @vitamin/prompt 的 AgentProfile 结构一致，在此本地声明以避免循环依赖。
 * JSON import 推断为 readonly，需要显式类型标注才能赋给可变的 AgentProfile[]。
 */
interface AgentProfileData {
  name: string
  taskTypes: string[]
  capabilities: string[]
  systemPromptTemplate: string
  defaultTools?: string[]
  preferredModelTier?: string
  defaultMaxToolTurns?: number
}

export const BUILTIN_AGENT_PROFILES: AgentProfileData[] = agentProfiles
export const COPILOT_MODELS = copilotModels
export const ANTHROPIC_MODELS = anthropicModels
export const TASK_TYPE_PROFILE_MAP = taskTypeProfileMap
