import { z } from 'zod'
import { TOOLS_EXECUTE_TIMEOUT_MS } from '@x-mars/env'
import { htmlToText } from './html-to-text'
import type { AgentTool, ToolResult } from '@x-mars/agent'

const BRAVE_SEARCH_URL = 'https://search.brave.com/search'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchProviderInput {
  query: string
  limit: number
  domains: string[]
  blockedDomains: string[]
  afterDate?: string
  signal?: AbortSignal
}

export interface WebSearchProviderOutput {
  results: SearchResult[]
  provider: string
  rawQuery?: string
}

export interface WebSearchProvider {
  name?: string
  search(input: WebSearchProviderInput): Promise<WebSearchProviderOutput>
}

export interface WebSearchOptions {
  provider?: WebSearchProvider
}

const WebSearchArgsSchema = z.object({
  query: z.string().min(1).max(500).describe('Search query'),
  domains: z
    .array(z.string().min(1).max(253))
    .max(20)
    .optional()
    .describe(
      'Optional domain allowlist. Results are restricted to these domains or their subdomains.',
    ),
  blockedDomains: z
    .array(z.string().min(1).max(253))
    .max(20)
    .optional()
    .describe('Optional domains to exclude from results. Subdomains are also excluded.'),
  recencyDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .optional()
    .describe('Optional freshness hint in days. Adds an after:YYYY-MM-DD query constraint.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (default: 10)'),
})

type WebSearchArgs = z.infer<typeof WebSearchArgsSchema>

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
}

function normalizeDomains(domains: string[] | undefined): string[] {
  return [...new Set((domains ?? []).map(normalizeDomain).filter(Boolean))]
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = normalizeDomain(hostname)
  const normalized = normalizeDomain(domain)
  return host === normalized || host.endsWith(`.${normalized}`)
}

function resultHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function buildSearchQuery(
  query: string,
  options: { domains?: string[]; blockedDomains?: string[]; recencyDays?: number },
): { query: string; domains: string[]; blockedDomains: string[]; afterDate?: string } {
  const domains = normalizeDomains(options.domains)
  const blockedDomains = normalizeDomains(options.blockedDomains)
  const parts = [query.trim()]

  if (domains.length > 0) {
    parts.push(`(${domains.map((domain) => `site:${domain}`).join(' OR ')})`)
  }

  if (blockedDomains.length > 0) {
    parts.push(blockedDomains.map((domain) => `-site:${domain}`).join(' '))
  }

  let afterDate: string | undefined
  if (options.recencyDays !== undefined) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - options.recencyDays)
    afterDate = date.toISOString().slice(0, 10)
    parts.push(`after:${afterDate}`)
  }

  return { query: parts.filter(Boolean).join(' '), domains, blockedDomains, afterDate }
}

function filterResults(
  results: SearchResult[],
  options: { domains: string[]; blockedDomains: string[] },
): SearchResult[] {
  if (options.domains.length === 0 && options.blockedDomains.length === 0) {
    return results
  }

  return results.filter((result) => {
    const host = resultHost(result.url)
    if (!host) {
      return false
    }

    if (options.domains.length > 0 && !options.domains.some((d) => hostMatchesDomain(host, d))) {
      return false
    }

    if (options.blockedDomains.some((d) => hostMatchesDomain(host, d))) {
      return false
    }

    return true
  })
}

function parseSearchResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = []

  // Brave Search 结果在 <div class="snippet ..." data-type="web"> 中
  const resultBlocks = html.split(/data-type="web"/)

  for (const block of resultBlocks.slice(1)) {
    if (results.length >= limit) {
      break
    }

    // 从第一个 <a href="..."> 提取 URL
    const urlMatch = block.match(/<a\s+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*svelte-/)
    const url = urlMatch?.[1]
    if (!url) {
      continue
    }

    // 从 search-snippet-title 的 title 属性提取标题
    const titleAttrMatch = block.match(
      /class="title\s+search-snippet-title[^"]*"[^>]*title="([^"]*)"/,
    )
    let title = ''
    if (titleAttrMatch?.[1]) {
      title = titleAttrMatch[1]
    } else {
      // 回退策略：提取 search-snippet-title 的内部文本
      const titleInnerMatch = block.match(
        /class="title\s+search-snippet-title[^"]*"[^>]*>([\s\S]*?)<\/div>/,
      )
      if (titleInnerMatch?.[1]) {
        title = htmlToText(titleInnerMatch[1]).trim()
      }
    }

    // 从 generic-snippet 内容提取摘要文本
    const snippetMatch = block.match(
      /class="generic-snippet[^"]*"[\s\S]*?class="content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    )
    const snippet = snippetMatch?.[1] ? htmlToText(snippetMatch[1]).trim() : ''

    if (url && title) {
      results.push({ title, url, snippet })
    }
  }

  return results
}

async function searchWithBraveHtml(
  input: WebSearchProviderInput,
): Promise<WebSearchProviderOutput> {
  const searchParams = new URLSearchParams({ q: input.query, source: 'web' })

  const response = await fetch(`${BRAVE_SEARCH_URL}?${searchParams}`, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: input.signal ?? AbortSignal.timeout(TOOLS_EXECUTE_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Search request failed: HTTP ${response.status}`)
  }

  const html = await response.text()
  return {
    provider: 'brave-html',
    rawQuery: input.query,
    results: parseSearchResults(html, Math.max(input.limit, 20)),
  }
}

export const braveHtmlSearchProvider: WebSearchProvider = {
  name: 'brave-html',
  search: searchWithBraveHtml,
}

function formatResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No results found for: "${query}"`
  }

  const lines = [`Search results for: "${query}"\n`]

  for (const [i, r] of results.entries()) {
    lines.push(`${i + 1}. ${r.title}`)
    lines.push(`   ${r.url}`)
    if (r.snippet) {
      lines.push(`   ${r.snippet}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

export function createWebSearch(
  _projectRoot: string,
  options: WebSearchOptions = {},
): AgentTool<WebSearchArgs> {
  const provider = options.provider ?? braveHtmlSearchProvider

  return {
    name: 'web_search',
    description:
      'Search the web and return results with titles, URLs, and snippets. Use this to discover relevant pages before fetching them with web_fetch. Supports domain allowlists, blocked domains, and recency hints for constrained research.',
    parameters: WebSearchArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params, signal }): Promise<ToolResult> {
      const { query, limit = 10 } = params
      const builtQuery = buildSearchQuery(query, {
        domains: params.domains,
        blockedDomains: params.blockedDomains,
        recencyDays: params.recencyDays,
      })

      let output: WebSearchProviderOutput
      try {
        output = await provider.search({
          query: builtQuery.query,
          limit,
          domains: builtQuery.domains,
          blockedDomains: builtQuery.blockedDomains,
          afterDate: builtQuery.afterDate,
          signal: signal ?? AbortSignal.timeout(TOOLS_EXECUTE_TIMEOUT_MS),
        })
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text:
                error instanceof Error ? error.message : `Search request failed: ${String(error)}`,
            },
          ],
          isError: true,
          details: {
            query,
            searchQuery: builtQuery.query,
            provider: provider.name ?? 'custom',
            domains: builtQuery.domains,
            blockedDomains: builtQuery.blockedDomains,
            afterDate: builtQuery.afterDate,
          },
        }
      }

      const results = filterResults(output.results, builtQuery).slice(0, limit)
      const text = formatResults(query, results)

      return {
        content: [{ type: 'text', text }],
        details: {
          query,
          searchQuery: builtQuery.query,
          provider: output.provider,
          domains: builtQuery.domains,
          blockedDomains: builtQuery.blockedDomains,
          afterDate: builtQuery.afterDate,
          resultCount: results.length,
          results,
        },
      }
    },
  }
}
