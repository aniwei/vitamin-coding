import type { PromptTemplate, ResourceDiagnostic } from './resource-manager'

export interface MemoryInjectionResult {
  injection: string
  memories: ReadonlyMap<string, string>
}

export interface MemoryInjectionSource {
  load(): Promise<MemoryInjectionResult>
  startWatching?(): void
  dispose(): void
}

export interface PromptTemplateResult {
  templates: PromptTemplate[]
  diagnostics: ResourceDiagnostic[]
}

export interface PromptTemplateSource {
  load(): Promise<PromptTemplateResult>
  dispose?(): void
}
