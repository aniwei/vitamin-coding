import { PromptCache } from './prompt-cache'
import {
  assembleGenericSubAgentPrompt,
  assembleSubAgentPrompt,
  type AgentProfile,
  type SubAgentPromptContext,
} from './sub-agent-prompt'
import type { PromptProvider } from './types'

export type PromptPreset = 'main' | 'subagent'

export type PromptPresetOptions =
  | {
      preset?: 'main'
    }
  | {
      preset: 'subagent'
      agentName: string
      profile?: AgentProfile
      context?: SubAgentPromptContext
    }

/** lead-guidance 合并后的单文件 key */
const LEAD_GUIDANCE_KEY = 'lead-guidance'

export interface PromptManagerOptions {
  provider: PromptProvider
}

export class PromptManager {
  private readonly provider: PromptProvider
  public readonly cache: PromptCache

  constructor(options: PromptManagerOptions) {
    this.cache = new PromptCache()
    this.provider = options.provider
  }

  async load(key: string): Promise<string | null> {
    const entry = await this.provider.load(key)
    if (!entry) return null
    this.cache.set(entry.key, entry.content, entry.version)
    return entry.content
  }

  async list(): Promise<string[]> {
    return this.provider.list()
  }

  async assemble(): Promise<string> {
    if (!this.cache.has(LEAD_GUIDANCE_KEY)) {
      const entry = await this.provider.load(LEAD_GUIDANCE_KEY)
      if (entry) {
        this.cache.set(entry.key, entry.content, entry.version)
      }
    }

    return this.cache.get(LEAD_GUIDANCE_KEY) ?? ''
  }

  async assemblePreset(options: PromptPresetOptions = { preset: 'main' }): Promise<string> {
    if (options.preset === 'subagent') {
      if (options.profile) {
        return assembleSubAgentPrompt(options.profile, options.context)
      }

      return assembleGenericSubAgentPrompt(options.agentName, options.context)
    }

    return this.assemble()
  }

  async loadSessionEndLearningPrompt(): Promise<string | null> {
    return this.load('lesson/session-end-learning')
  }

  invalidate(): void {
    this.cache.clear()
  }
}
