import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export function getBuiltinPromptPath(key: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return resolve(__dirname, '..', 'prompts', key)
}

export interface PromptEntry {
  key: string
  content: string
  version: number
}

export interface PromptProvider {
  load(key: string): Promise<PromptEntry | null>
  list(): Promise<string[]>
  loadMany(keys: string[]): Promise<Map<string, PromptEntry>>
}

export interface LocalProviderOptions {
  type: 'local'
  baseDir: string
  extension?: string
}

export interface RemoteProviderOptions {
  type: 'remote'
  baseUrl: string
  getAuth?: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export type PromptProviderOptions = LocalProviderOptions | RemoteProviderOptions

export interface PhaseAnnotation {
  currentPhase: string
  phaseHistory: string[]
  tasksSummary?: string
}

export interface Lesson {
  tags: string[]
  trigger: string
  insight: string
}
