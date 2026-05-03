import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const SessionSearchArgsSchema = z.object({
  query: z.string().min(1).describe('Search query for prior session messages or summaries.'),
  limit: z.number().int().min(1).max(20).optional().describe('Maximum sessions to return.'),
})

type SessionSearchArgs = z.infer<typeof SessionSearchArgsSchema>

export interface SessionSearchMatch {
  role?: string
  text: string
  timestamp?: number
}

export interface SessionSearchResult {
  id: string
  title?: string
  messageCount: number
  lastActiveAt: number
  score: number
  summary: string
  matches: SessionSearchMatch[]
}

export type SearchSessions = (input: {
  query: string
  limit: number
}) => Promise<SessionSearchResult[]>

interface SessionSearchOptions {
  searchSessions?: SearchSessions
}

export function createSessionSearch(
  options: SessionSearchOptions = {},
): AgentTool<SessionSearchArgs> {
  return {
    name: 'session_search',
    description:
      'Search previous conversation sessions by query and return focused summaries with matching excerpts.',
    parameters: SessionSearchArgsSchema,
    visibility: 'always',
    readonly: true,
    isConcurrencySafe: () => true,

    async execute({ params }): Promise<ToolResult> {
      if (!options.searchSessions) {
        throw new Error('SearchSessions dependency is not provided in options')
      }

      const results = await options.searchSessions({
        query: params.query,
        limit: params.limit ?? 5,
      })

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No sessions matched query: ${params.query}` }],
          details: { query: params.query, results: [] },
        }
      }

      return {
        content: [{ type: 'text', text: formatSessionSearchResults(params.query, results) }],
        details: { query: params.query, results },
      }
    },
  }
}

function formatSessionSearchResults(query: string, results: SessionSearchResult[]): string {
  const lines = [`Session search results for "${query}":`]

  for (const result of results) {
    const title = result.title ? ` — ${result.title}` : ''
    lines.push(
      `- ${result.id}${title} (score ${result.score}, ${result.messageCount} messages): ${result.summary}`,
    )

    for (const match of result.matches.slice(0, 3)) {
      const role = match.role ? `${match.role}: ` : ''
      lines.push(`  - ${role}${match.text}`)
    }
  }

  return lines.join('\n')
}
