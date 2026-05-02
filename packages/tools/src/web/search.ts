import { z } from 'zod'
import { TOOLS_EXECUTE_TIMEOUT_MS } from '@vitamin/env'
import { htmlToText } from './html-to-text'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const BRAVE_SEARCH_URL = 'https://search.brave.com/search'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

const WebSearchArgsSchema = z.object({
  query: z.string().min(1).max(500).describe('Search query'),
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

export function createWebSearch(_projectRoot: string): AgentTool<WebSearchArgs> {
  return {
    name: 'web_search',
    description:
      'Search the web and return results with titles, URLs, and snippets. Use this to discover relevant pages before fetching them with web_fetch.',
    parameters: WebSearchArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params, signal }): Promise<ToolResult> {
      const { query, limit = 10 } = params

      const searchParams = new URLSearchParams({ q: query, source: 'web' })

      const response = await fetch(`${BRAVE_SEARCH_URL}?${searchParams}`, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: signal ?? AbortSignal.timeout(TOOLS_EXECUTE_TIMEOUT_MS),
      })

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Search request failed: HTTP ${response.status}` }],
          isError: true,
        }
      }

      const html = await response.text()
      const results = parseSearchResults(html, limit)
      const text = formatResults(query, results)

      return {
        content: [{ type: 'text', text }],
        details: {
          query,
          resultCount: results.length,
          results,
        },
      }
    },
  }
}
