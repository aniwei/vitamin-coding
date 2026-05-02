// Provider 抽象层和实现
export { LocalPromptProvider } from './local-provider'
export { HttpPromptProvider } from './http-provider'
export { createPromptProvider } from './prompt-factory'

// 核心类
export { PromptManager } from './prompt-manager'
export type { PromptManagerOptions, PromptPreset, PromptPresetOptions } from './prompt-manager'
export { PromptCache } from './prompt-cache'
export {
  appendPromptSection,
  assemblePromptSections,
  createPromptSection,
  isPromptAssembly,
  renderPromptSections,
} from './prompt-assembly'

// 常量
export { BUILTIN_PROMPTS_DIR } from './constants'

// 辅助函数
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
export type { Environment } from './environment-context'

// 类型
export type {
  PromptEntry,
  PromptProvider,
  PromptProviderOptions,
  LocalProviderOptions,
  RemoteProviderOptions,
  PromptAssembly,
  PromptAssemblyDiagnostics,
  PromptSection,
  PromptSectionDiagnostic,
  PromptSectionInput,
  PromptSectionLayer,
  PhaseAnnotation,
  Lesson,
} from './types'
