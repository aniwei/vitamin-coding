import agentProfiles from './data/agent-profiles.json' with { type: 'json' }
import taskTypeProfileMap from './data/task-type-profile-map.json' with { type: 'json' }
import type { AgentProfile } from '@vitamin/prompt'

export const BUILTIN_AGENT_PROFILES: AgentProfile[] = agentProfiles as AgentProfile[]
export const TASK_TYPE_PROFILE_MAP = taskTypeProfileMap
