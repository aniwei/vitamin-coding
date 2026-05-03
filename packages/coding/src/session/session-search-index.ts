import type { AgentMessage } from '@x-mars/agent'
import type { SessionSnapshot } from '@x-mars/session'
import type { SessionSearchMatch, SessionSearchResult } from '@x-mars/tools'

type SearchDocumentSource = 'title' | 'summary' | 'message'

interface SearchDocument {
  sessionId: string
  source: SearchDocumentSource
  role?: string
  timestamp?: number
  text: string
  normalized: string
  tokens: string[]
}

interface SessionSearchIndex {
  documentsBySession: Map<string, SearchDocument[]>
  postingsByTerm: Map<string, Map<string, number>>
  snapshotsBySession: Map<string, SessionSnapshot<AgentMessage>>
}

export function searchSessionSnapshots(
  snapshots: Iterable<SessionSnapshot<AgentMessage>>,
  input: { query: string; limit: number },
): SessionSearchResult[] {
  const query = input.query.trim()
  if (!query) {
    return []
  }

  const terms = tokenizeSearchQuery(query)
  const normalizedQuery = normalizeSearchText(query)
  const index = buildSessionSearchIndex(snapshots)
  const candidateIds = collectCandidateSessions(index, terms)

  return [...candidateIds]
    .map((sessionId) => scoreIndexedSession(index, sessionId, normalizedQuery, terms))
    .filter((result): result is SessionSearchResult => result !== null)
    .sort((a, b) => b.score - a.score || b.lastActiveAt - a.lastActiveAt)
    .slice(0, input.limit)
}

function buildSessionSearchIndex(
  snapshots: Iterable<SessionSnapshot<AgentMessage>>,
): SessionSearchIndex {
  const documentsBySession = new Map<string, SearchDocument[]>()
  const postingsByTerm = new Map<string, Map<string, number>>()
  const snapshotsBySession = new Map<string, SessionSnapshot<AgentMessage>>()

  for (const snapshot of snapshots) {
    snapshotsBySession.set(snapshot.id, snapshot)
    const documents = snapshotToSearchDocuments(snapshot)
    documentsBySession.set(snapshot.id, documents)

    for (const document of documents) {
      for (const token of document.tokens) {
        const postings = getOrCreateMap(postingsByTerm, token)
        postings.set(document.sessionId, (postings.get(document.sessionId) ?? 0) + 1)
      }
    }
  }

  return { documentsBySession, postingsByTerm, snapshotsBySession }
}

function collectCandidateSessions(index: SessionSearchIndex, terms: string[]): Set<string> {
  const candidates = new Set<string>()

  for (const term of terms) {
    const postings = index.postingsByTerm.get(term)
    if (!postings) {
      continue
    }

    for (const sessionId of postings.keys()) {
      candidates.add(sessionId)
    }
  }

  return candidates
}

function scoreIndexedSession(
  index: SessionSearchIndex,
  sessionId: string,
  normalizedQuery: string,
  terms: string[],
): SessionSearchResult | null {
  const snapshot = index.snapshotsBySession.get(sessionId)
  const documents = index.documentsBySession.get(sessionId) ?? []
  if (!snapshot || documents.length === 0) {
    return null
  }

  let score = 0
  const matchedTerms = new Set<string>()
  const matchedDocuments: Array<{ document: SearchDocument; score: number }> = []

  for (const document of documents) {
    let documentScore = 0
    if (normalizedQuery && document.normalized.includes(normalizedQuery)) {
      documentScore += sourceWeight(document.source) * 20
    }

    for (const term of terms) {
      const occurrences = countOccurrences(document.tokens, term)
      if (occurrences > 0) {
        matchedTerms.add(term)
        documentScore += occurrences * sourceWeight(document.source)
      }
    }

    if (documentScore > 0) {
      score += documentScore
      matchedDocuments.push({ document, score: documentScore })
    }
  }

  if (score <= 0) {
    return null
  }

  matchedDocuments.sort(
    (a, b) =>
      b.score - a.score ||
      (b.document.timestamp ?? Number.MAX_SAFE_INTEGER) -
        (a.document.timestamp ?? Number.MAX_SAFE_INTEGER),
  )

  const matches: SessionSearchMatch[] = matchedDocuments.slice(0, 5).map(({ document }) => ({
    role: document.role,
    source: document.source,
    text: truncateSearchText(document.text, 240),
    timestamp: document.timestamp,
  }))

  const summary = buildFocusedSummary(
    snapshot,
    matchedDocuments.map((match) => match.document),
  )

  return {
    id: snapshot.id,
    title: snapshot.metadata.title,
    groupId: snapshot.metadata.parentSessionId ?? snapshot.id,
    workspaceDir: snapshot.metadata.workspaceDir,
    messageCount: snapshot.metadata.messageCount,
    lastActiveAt: snapshot.metadata.lastActiveAt,
    score,
    summary: truncateSearchText(summary, 280),
    matchedTerms: [...matchedTerms],
    matches,
  }
}

function snapshotToSearchDocuments(snapshot: SessionSnapshot<AgentMessage>): SearchDocument[] {
  const documents: SearchDocument[] = []
  const title = snapshot.metadata.title?.trim()
  if (title) {
    documents.push(createSearchDocument(snapshot.id, 'title', title))
  }

  for (const entry of snapshot.entries) {
    if (entry.type === 'compaction') {
      documents.push(
        createSearchDocument(snapshot.id, 'summary', entry.summary, undefined, entry.timestamp),
      )
      continue
    }

    const messageText = agentMessageToSearchText(entry.message)
    if (messageText.text) {
      documents.push(
        createSearchDocument(
          snapshot.id,
          'message',
          messageText.text,
          messageText.role,
          entry.timestamp,
        ),
      )
    }
  }

  return documents
}

function createSearchDocument(
  sessionId: string,
  source: SearchDocumentSource,
  text: string,
  role?: string,
  timestamp?: number,
): SearchDocument {
  const normalized = normalizeSearchText(text)
  return {
    sessionId,
    source,
    role,
    timestamp,
    text,
    normalized,
    tokens: tokenizeSearchQuery(text),
  }
}

function buildFocusedSummary(
  snapshot: SessionSnapshot<AgentMessage>,
  matchedDocuments: SearchDocument[],
): string {
  const summaryMatch = matchedDocuments.find((document) => document.source === 'summary')
  if (summaryMatch) {
    return summaryMatch.text
  }

  const messageMatch = matchedDocuments.find((document) => document.source === 'message')
  if (messageMatch) {
    return messageMatch.text
  }

  const titleMatch = matchedDocuments.find((document) => document.source === 'title')
  if (titleMatch) {
    return `Session titled "${titleMatch.text}" matched query.`
  }

  return snapshot.metadata.title
    ? `Session titled "${snapshot.metadata.title}" matched query.`
    : 'Session matched query.'
}

function agentMessageToSearchText(message: AgentMessage): { role?: string; text: string } {
  if (typeof message !== 'object' || message === null) {
    return { text: String(message) }
  }

  const record = message as unknown as Record<string, unknown>
  const role = typeof record.role === 'string' ? record.role : undefined
  const content = record.content

  if (typeof content === 'string') {
    return { role, text: content }
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (typeof part === 'object' && part !== null && 'text' in part) {
          const value = (part as { text?: unknown }).text
          return typeof value === 'string' ? value : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
    return { role, text }
  }

  return { role, text: '' }
}

function tokenizeSearchQuery(query: string): string[] {
  const terms = normalizeSearchText(query)
    .split(/[^a-z0-9_./:-]+/i)
    .map((term) => term.trim())
    .filter(Boolean)

  return terms.length > 0 ? [...new Set(terms)] : [normalizeSearchText(query)]
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function countOccurrences(tokens: string[], term: string): number {
  return tokens.reduce((count, token) => count + (token === term ? 1 : 0), 0)
}

function sourceWeight(source: SearchDocumentSource): number {
  if (source === 'title') {
    return 5
  }
  if (source === 'summary') {
    return 3
  }
  return 1
}

function truncateSearchText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}…`
}

function getOrCreateMap<K, V>(map: Map<K, Map<K, V>>, key: K): Map<K, V> {
  let value = map.get(key)
  if (!value) {
    value = new Map<K, V>()
    map.set(key, value)
  }
  return value
}
