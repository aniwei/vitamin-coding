import { PromptManager } from '../lead/prompt-manager'
import { getLastAssistantText } from '../modes/run-modes'

import type { AgentTool } from '@vitamin/agent'
import type { Model, ModelSpec, ModelRegistry } from '@vitamin/ai'
import type { SessionFactory, AgentSessionHandle } from '@vitamin/orchestrator'
import type { AgentSession } from '../session/agent-session'
import type { CodingSessionManager } from '../session/coding-session-manager'
import type { RegisteredTool, ToolRegistry } from '@vitamin/tools'
import type { PromptToolSummary } from '../lead/prompt-manager'

export function resolveModel(
  specModel: unknown,
  modelRegistry: ModelRegistry,
): Model | undefined {
  if (!specModel) return modelRegistry.getDefault()

  if (typeof specModel === 'object' && specModel !== null && 'api' in specModel && 'baseUrl' in specModel) {
    return specModel as Model
  }

  try {
    return modelRegistry.resolve(specModel as ModelSpec)
  } catch (err) {
    console.warn(`[session-factory] Failed to resolve model spec, falling back to default:`, err)
    return modelRegistry.getDefault()
  }
}


export function createSessionFactoryAdapter(params: {
  codingSessionManager: CodingSessionManager
  getToolRegistry: () => ToolRegistry | null
  promptManager: PromptManager
  defaultTools?: AgentTool[]
  modelRegistry: ModelRegistry
}): SessionFactory {
  const { codingSessionManager: csm, getToolRegistry, promptManager, defaultTools, modelRegistry } = params

  const summarizeTools = (tools: AgentTool[] | undefined): PromptToolSummary[] => {
    if (!tools || tools.length === 0) return []

    return tools.map((tool) => {
      const registered = getToolRegistry()?.get(tool.name) as RegisteredTool | undefined
      return {
        name: tool.name,
        description: tool.description,
        category: registered?.metadata.category,
        source: registered?.metadata.builtin ? 'builtin' : 'custom',
        snippet: registered?.metadata.snippet,
        guideline: registered?.metadata.guideline,
      }
    })
  }

  const toHandle = (session: AgentSession): AgentSessionHandle => ({
    id: session.id,
    get status() { return session.status },
    prompt: (text: string) => session.prompt(text),
    abort: () => session.abort(),
    getLastAssistantText: () => getLastAssistantText(session.session.messages()),
  })

  return {
    createSession: async (options) => {
      const model = resolveModel(options?.model, modelRegistry)

      const tools = (options?.tools as AgentTool[] | undefined)
        ?? getToolRegistry()?.getAvailable('full') as AgentTool[] | undefined
        ?? defaultTools

      const systemPrompt = promptManager.buildSubagentPrompt({
        specSystemPrompt: options?.systemPrompt,
        toolCatalog: summarizeTools(tools),
      })

      const session = await csm.createSession({
        model,
        systemPrompt,
        workspaceDir: options?.workspaceDir,
        id: options?.id,
        tools,
        maxToolTurns: options?.maxToolTurns,
      })
      return toHandle(session)
    },
    removeSession: (id: string) => csm.removeSession(id),
    getSession: (id: string) => {
      const session = csm.getSession(id)
      return session ? toHandle(session) : undefined
    },
  }
}
