import type { AgentTool, ToolCallContext, ToolResult } from './types'
import type { ZodType } from '@vitamin/ai'

const TOOL_SEARCH_NAME = 'tool_search'

interface ToolSearchArgs {
  query: string
  max_results?: number
}

const ToolSearchArgsSchema: ZodType<ToolSearchArgs> = {
  parse(data: unknown): ToolSearchArgs {
    const obj = data as Record<string, unknown>
    if (typeof obj.query !== 'string' || !obj.query) {
      throw new Error('query is required and must be a string')
    }
    return {
      query: obj.query,
      max_results: typeof obj.max_results === 'number' ? obj.max_results : undefined,
    }
  },
  safeParse(data: unknown) {
    try {
      return { success: true, data: this.parse(data) }
    } catch (error) {
      return { success: false, error }
    }
  },
  toJSONSchema() {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
          default: 5,
        },
      },
      required: ['query'],
      additionalProperties: false,
    }
  },
}

export class DeferredToolManager {
  private readonly deferred = new Map<string, AgentTool>()
  private readonly loaded = new Set<string>()

  constructor(tools: AgentTool[]) {
    for (const tool of tools) {
      if (tool.shouldDefer) {
        this.deferred.set(tool.name, tool)
      }
    }
  }

  get hasDeferredTools(): boolean {
    return this.deferred.size > 0
  }

  isDeferred(name: string): boolean {
    return this.deferred.has(name)
  }

  isLoaded(name: string): boolean {
    return this.loaded.has(name)
  }

  getActiveTools(allTools: AgentTool[]): AgentTool[] {
    return allTools.filter((t) => !t.shouldDefer || this.loaded.has(t.name))
  }

  search(query: string, maxResults = 5): AgentTool[] {
    const trimmed = query.trim()

    if (trimmed.startsWith('select:')) {
      const names = trimmed
        .slice(7)
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      return names
        .map((name) => this.deferred.get(name))
        .filter((t): t is AgentTool => t !== undefined)
    }

    const lowerQuery = trimmed.toLowerCase()
    const scored: { tool: AgentTool; score: number }[] = []

    for (const tool of this.deferred.values()) {
      let score = 0
      const lowerName = tool.name.toLowerCase()
      const lowerDesc = tool.description.toLowerCase()

      if (lowerName === lowerQuery) {
        score += 10
      } else if (lowerName.includes(lowerQuery)) {
        score += 5
      }

      if (lowerDesc.includes(lowerQuery)) {
        score += 2
      }

      for (const word of lowerQuery.split(/\s+/)) {
        if (lowerName.includes(word)) {
          score += 1
        }
        if (lowerDesc.includes(word)) {
          score += 1
        }
      }

      if (score > 0) {
        scored.push({ tool, score })
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.tool)
  }

  markLoaded(names: string[]): void {
    for (const name of names) {
      if (this.deferred.has(name)) {
        this.loaded.add(name)
      }
    }
  }

  reset(): void {
    this.loaded.clear()
  }
}

function formatToolSchema(tool: AgentTool): string {
  const schema = tool.parameters.toJSONSchema?.() ?? {}
  return JSON.stringify(
    {
      name: tool.name,
      description: tool.description,
      parameters: schema,
    },
    null,
    2,
  )
}

export function createToolSearchTool(manager: DeferredToolManager): AgentTool {
  return {
    name: TOOL_SEARCH_NAME,
    description:
      'Fetches full schema definitions for deferred tools so they can be called. ' +
      'Use "select:<name>[,<name>...]" for direct selection, or keywords to search.',
    parameters: ToolSearchArgsSchema as ZodType,
    readonly: true,
    shouldDefer: false,
    async execute(ctx: ToolCallContext): Promise<ToolResult> {
      const { query, max_results } = ctx.params as ToolSearchArgs
      const matches = manager.search(query, max_results ?? 5)

      if (matches.length === 0) {
        return {
          content: [{ type: 'text', text: 'No matching deferred tools found.' }],
        }
      }

      manager.markLoaded(matches.map((t) => t.name))

      const schemas = matches.map(formatToolSchema).join('\n\n')
      const header = `Found ${matches.length} tool(s). Their schemas are now loaded and callable:\n\n`

      return {
        content: [{ type: 'text', text: header + schemas }],
      }
    },
  }
}

export function getDeferredToolNames(tools: AgentTool[]): string[] {
  return tools.filter((t) => t.shouldDefer).map((t) => t.name)
}

export { TOOL_SEARCH_NAME }
