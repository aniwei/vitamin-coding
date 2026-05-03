import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const SessionSearchArgsSchema = z.object({
  query: z.string().min(1).describe('Search query for prior session messages or summaries.'),
  limit: z.number().int().min(1).max(20).optional().describe('Maximum sessions to return.'),
})

type SessionSearchArgs = z.infer<typeof SessionSearchArgsSchema>

export interface SessionSearchMatch {
  role?: string
  source?: 'title' | 'summary' | 'message'
  text: string
  timestamp?: number
}

export interface SessionSearchResult {
  id: string
  title?: string
  messageCount: number
  lastActiveAt: number
  score: number
  groupId?: string
  workspaceDir?: string
  matchedTerms?: string[]
  summary: string
  matches: SessionSearchMatch[]
}

export interface SessionSearchGroup {
  groupId: string
  title?: string
  score: number
  messageCount: number
  sessionCount: number
  evidenceCount: number
  lastActiveAt: number
  workspaceDir?: string
  matchedTerms?: string[]
  summary: string
  sessions: SessionSearchResult[]
}

export type SearchSessions = (input: {
  query: string
  limit: number
}) => Promise<SessionSearchResult[]>

export type SummarizeSessionSearchGroups = (input: {
  query: string
  groups: SessionSearchGroup[]
  results: SessionSearchResult[]
}) => Promise<SessionSearchGroup[]>

interface SessionSearchOptions {
  searchSessions?: SearchSessions
  summarizeGroups?: SummarizeSessionSearchGroups
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
      let groups = groupSessionSearchResults(results)

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No sessions matched query: ${params.query}` }],
          details: { query: params.query, results: [], groups: [] },
        }
      }

      if (options.summarizeGroups) {
        groups = await options.summarizeGroups({ query: params.query, groups, results })
      }

      return {
        content: [{ type: 'text', text: formatSessionSearchResults(params.query, groups) }],
        details: { query: params.query, results, groups },
      }
    },
  }
}

function groupSessionSearchResults(results: SessionSearchResult[]): SessionSearchGroup[] {
  const groupsById = new Map<string, SessionSearchGroup>()

  for (const result of results) {
    const groupId = result.groupId ?? result.id
    const existing = groupsById.get(groupId)
    if (!existing) {
      groupsById.set(groupId, {
        groupId,
        title: result.title,
        score: result.score,
        messageCount: result.messageCount,
        sessionCount: 1,
        evidenceCount: result.matches.length,
        lastActiveAt: result.lastActiveAt,
        workspaceDir: result.workspaceDir,
        matchedTerms: result.matchedTerms ? [...result.matchedTerms] : undefined,
        summary: result.summary,
        sessions: [result],
      })
      continue
    }

    existing.score += result.score
    existing.messageCount += result.messageCount
    existing.sessionCount++
    existing.evidenceCount += result.matches.length
    existing.lastActiveAt = Math.max(existing.lastActiveAt, result.lastActiveAt)
    existing.workspaceDir ??= result.workspaceDir
    existing.matchedTerms = mergeMatchedTerms(existing.matchedTerms, result.matchedTerms)
    existing.sessions.push(result)
    existing.sessions.sort((a, b) => b.score - a.score || b.lastActiveAt - a.lastActiveAt)

    const top = existing.sessions[0]
    existing.title = top?.title
  }

  for (const group of groupsById.values()) {
    group.summary = buildGroupFocusedSummary(group)
  }

  return [...groupsById.values()].sort(
    (a, b) => b.score - a.score || b.lastActiveAt - a.lastActiveAt,
  )
}

function mergeMatchedTerms(
  current: string[] | undefined,
  next: string[] | undefined,
): string[] | undefined {
  if (!current && !next) {
    return undefined
  }

  return [...new Set([...(current ?? []), ...(next ?? [])])]
}

function buildGroupFocusedSummary(group: SessionSearchGroup): string {
  const topSession = group.sessions[0]
  const terms = group.matchedTerms?.slice(0, 6).join(', ')
  const termText = terms ? `Matched terms: ${terms}. ` : ''
  const relationText =
    group.sessionCount > 1 ? `${group.sessionCount} related sessions matched. ` : ''
  const topText = topSession ? `Top session ${topSession.id}: ${topSession.summary}` : group.summary
  const evidence = group.sessions
    .flatMap((session) =>
      session.matches.slice(0, 2).map((match) => {
        const label = match.role ?? match.source
        return label ? `${label}: ${match.text}` : match.text
      }),
    )
    .slice(0, 3)

  const evidenceText = evidence.length > 0 ? ` Evidence: ${evidence.join(' | ')}` : ''
  return `${relationText}${termText}${topText}${evidenceText}`
}

function formatSessionSearchResults(query: string, groups: SessionSearchGroup[]): string {
  const lines = [`Session search results for "${query}":`]

  for (const group of groups) {
    const groupTitle = group.title ? ` — ${group.title}` : ''
    lines.push(
      `- Group ${group.groupId}${groupTitle} (score ${group.score}, ${group.sessionCount} sessions, ${group.messageCount} messages, ${group.evidenceCount} evidence): ${group.summary}`,
    )

    for (const session of group.sessions.slice(0, 3)) {
      const title = session.title ? ` — ${session.title}` : ''
      lines.push(`  - ${session.id}${title} (score ${session.score}): ${session.summary}`)

      for (const match of session.matches.slice(0, 2)) {
        const label = match.role ?? match.source
        const prefix = label ? `${label}: ` : ''
        lines.push(`    - ${prefix}${match.text}`)
      }
    }
  }

  return lines.join('\n')
}
