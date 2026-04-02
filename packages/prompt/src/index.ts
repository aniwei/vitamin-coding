// Provider 抽象与实现
export { LocalPromptProvider } from './local-provider'
export { RemotePromptProvider } from './remote-provider'
export { createPromptProvider } from './prompt-factory'

// 核心类
export { PromptManager } from './prompt-manager'
export type { PromptManagerOptions, PromptPreset, PromptPresetOptions } from './prompt-manager'
export { PromptCache } from './prompt-cache'

// 常量
export { BUILTIN_PROMPTS_DIR } from './constants'

// 辅助函数
export { injectPhaseContext, extractPhaseFromMessage } from './phase-context'
export { buildLessonInjection, SESSION_END_LEARNING_PROMPT } from './lesson-injection'
export {
  assembleGenericSubAgentPrompt,
  assembleSubAgentPrompt,
  resolveAgentProfile,
  resolveAgentToolNames,
} from './sub-agent-prompt'
export type { AgentProfile, SubAgentPromptContext } from './sub-agent-prompt'
export { collectEnvironment, formatEnvironmentBlock } from './environment-context'
export type { EnvironmentSnapshot } from './environment-context'

// 类型
export type {
  PromptEntry,
  PromptProvider,
  PromptProviderOptions,
  LocalProviderOptions,
  RemoteProviderOptions,
  PhaseAnnotation,
  Lesson,
} from './types'
