// Provider abstractions and implementations
export { LocalPromptProvider } from './local-provider'
export { RemotePromptProvider } from './remote-provider'
export { createPromptProvider } from './prompt-factory'

// Core classes
export { PromptManager } from './prompt-manager'
export type { PromptManagerOptions, PromptPreset, PromptPresetOptions } from './prompt-manager'
export { PromptCache } from './prompt-cache'

// Constants
export { BUILTIN_PROMPTS_DIR } from './constants'

// Helper functions
export { injectPhaseContext, extractPhaseFromMessage } from './phase-context'
export { buildLessonInjection } from './lesson-injection'
export {
  assembleGenericSubAgentPrompt,
  assembleSubAgentPrompt,
  resolveAgentProfile,
  resolveAgentToolNames,
} from './sub-agent-prompt'
export type { AgentProfile, SubAgentPromptContext } from './sub-agent-prompt'
export { collectEnvironment, formatEnvironmentBlock } from './environment-context'
export type { EnvironmentSnapshot } from './environment-context'

// Types
export type {
  PromptEntry,
  PromptProvider,
  PromptProviderOptions,
  LocalProviderOptions,
  RemoteProviderOptions,
  PhaseAnnotation,
  Lesson,
} from './types'
