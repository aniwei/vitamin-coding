export { SettingsManager, createSettingsManager } from './settings-manager'
export type { SettingsOptions, SettingsManagerOptions } from './settings-manager'

export {
  DefaultResourceManager,
  createResourceManager,
  createInMemoryResourceManager,
} from './resource-manager'
export type {
  ResourceManager,
  ResourceManagerOptions,
  LoadedResources,
  ResourceDiagnostic,
  PromptTemplate,
} from './resource-manager'

export type {
  MemoryInjectionSource,
  MemoryInjectionResult,
  PromptTemplateSource,
  PromptTemplateResult,
} from './types'

export { PersistentMemorySource, InMemoryMemorySource } from './memory-source'
export type { PersistentMemorySourceOptions } from './memory-source'

export {
  FilesystemPromptTemplateSource,
  InMemoryPromptTemplateSource,
} from './prompt-template-source'
export type { FilesystemPromptTemplateSourceOptions } from './prompt-template-source'
