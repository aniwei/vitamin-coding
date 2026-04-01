import agentProfiles from './data/agent-profiles.json' with { type: 'json' }
import copilotModels from './data/copilot-models.json' with { type: 'json' }
import taskTypeProfileMap from './data/task-type-profile-map.json' with { type: 'json' }

export const BUILTIN_AGENT_PROFILES = agentProfiles
export const COPILOT_MODELS = copilotModels
export const TASK_TYPE_PROFILE_MAP = taskTypeProfileMap
