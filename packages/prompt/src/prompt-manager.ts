import { PromptCache } from './prompt-cache'
import {
  assembleGenericSubAgentPrompt,
  assembleSubAgentPrompt,
  type AgentProfile,
  type SubAgentPromptContext,
} from './sub-agent-prompt'
import { assemblePromptSections } from './prompt-assembly'
import type { PromptAssembly, PromptProvider, PromptSectionInput } from './types'

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

/** Merged single-file key for lead-guidance */
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
    if (!entry) {
      return null
    }
    this.cache.set(entry.key, entry.content, entry.version)
    return entry.content
  }

  async list(): Promise<string[]> {
    return this.provider.list()
  }

  async assemble(): Promise<string> {
    return (await this.assembleSections()).systemPrompt
  }

  async assembleSections(): Promise<PromptAssembly> {
    if (!this.cache.has(LEAD_GUIDANCE_KEY)) {
      const entry = await this.provider.load(LEAD_GUIDANCE_KEY)
      if (entry) {
        this.cache.set(entry.key, entry.content, entry.version)
      }
    }

    return assemblePromptSections([
      {
        key: LEAD_GUIDANCE_KEY,
        content: this.cache.get(LEAD_GUIDANCE_KEY) ?? '',
        layer: 'static',
        cacheable: true,
        source: 'builtin',
        priority: 0,
      },
    ])
  }

  async assemblePreset(options: PromptPresetOptions = { preset: 'main' }): Promise<string> {
    return (await this.assemblePresetSections(options)).systemPrompt
  }

  async assemblePresetSections(
    options: PromptPresetOptions = { preset: 'main' },
  ): Promise<PromptAssembly> {
    if (options.preset === 'subagent') {
      let content: string
      let source: string
      if (options.profile) {
        content = assembleSubAgentPrompt(options.profile, options.context)
        source = `profile:${options.profile.name}`
      } else {
        content = assembleGenericSubAgentPrompt(options.agentName, options.context)
        source = 'generic-subagent'
      }

      const sections: PromptSectionInput[] = [
        {
          key: `subagent:${options.agentName}`,
          content,
          layer: 'static',
          cacheable: true,
          source,
          priority: 0,
        },
      ]
      return assemblePromptSections(sections)
    }

    return this.assembleSections()
  }

  async loadSessionEndLearningPrompt(): Promise<string | null> {
    return this.load('lesson/session-end-learning')
  }

  async loadRuntimeLessonsTemplate(): Promise<string | null> {
    return this.load('lesson/runtime-lessons')
  }

  invalidate(): void {
    this.cache.clear()
  }
}
