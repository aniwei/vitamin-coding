import { z } from 'zod'
import { TOOLS_MAX_OUTPUT_BYTES, TOOLS_EXECUTE_TIMEOUT_MS } from '@x-mars/env'
import { formatBytes, truncateTail } from '@x-mars/shared'
import { validateUrl } from './url-validator'
import { htmlToText, htmlToMarkdown } from './html-to-text'
import type { AgentTool, ToolResult } from '@x-mars/agent'

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024 // 5MB
const DEFAULT_USER_AGENT = 'XMarsBot/1.0'

const WebFetchArgsSchema = z.object({
  url: z.string().describe('URL to fetch content from'),
  format: z
    .enum(['text', 'markdown', 'raw'])
    .optional()
    .default('text')
    .describe('Output format: text (cleaned, default), markdown, or raw HTML'),
  headers: z.record(z.string(), z.string()).optional().describe('Additional HTTP headers'),
  allowedDomains: z
    .array(z.string().min(1).max(253))
    .max(20)
    .optional()
    .describe(
      'Optional domain allowlist. When set, the URL host must match one of these domains or its subdomains.',
    ),
  maxLength: z
    .number()
    .int()
    .min(1000)
    .max(500_000)
    .optional()
    .describe('Maximum output length in characters'),
})

type WebFetchArgs = z.infer<typeof WebFetchArgsSchema>

export interface WebFetchProviderInput {
  url: URL
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface WebFetchProviderOutput {
  contentType: string
  contentLength: number
  body: ArrayBuffer
  status: number
  statusText: string
  provider: string
}

export interface WebFetchProvider {
  name?: string
  fetch(input: WebFetchProviderInput): Promise<WebFetchProviderOutput>
}

export interface WebFetchOptions {
  provider?: WebFetchProvider
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = normalizeDomain(hostname)
  const normalized = normalizeDomain(domain)
  return host === normalized || host.endsWith(`.${normalized}`)
}

function validateAllowedDomains(url: URL, allowedDomains: string[] | undefined): string[] {
  if (!allowedDomains?.length) {
    return []
  }

  const normalized = [...new Set(allowedDomains.map(normalizeDomain).filter(Boolean))]
  const allowed = normalized.some((domain) => hostMatchesDomain(url.hostname, domain))
  if (!allowed) {
    throw new Error(
      `URL host ${url.hostname} is not allowed. Allowed domains: ${normalized.join(', ')}`,
    )
  }

  return normalized
}

async function fetchWithNative(input: WebFetchProviderInput): Promise<WebFetchProviderOutput> {
  const response = await fetch(input.url.href, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'text/html, application/json, text/plain, */*',
      ...input.headers,
    },
    signal: input.signal ?? AbortSignal.timeout(TOOLS_EXECUTE_TIMEOUT_MS),
    redirect: 'follow',
  })

  const contentType = response.headers.get('content-type') ?? ''
  const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10)

  if (!response.ok) {
    return {
      provider: 'native-fetch',
      status: response.status,
      statusText: response.statusText,
      contentType,
      contentLength,
      body: new ArrayBuffer(0),
    }
  }

  return {
    provider: 'native-fetch',
    status: response.status,
    statusText: response.statusText,
    contentType,
    contentLength,
    body: await response.arrayBuffer(),
  }
}

export const nativeWebFetchProvider: WebFetchProvider = {
  name: 'native-fetch',
  fetch: fetchWithNative,
}

export function createWebFetch(
  _projectRoot: string,
  options: WebFetchOptions = {},
): AgentTool<WebFetchArgs> {
  const provider = options.provider ?? nativeWebFetchProvider

  return {
    name: 'web_fetch',
    description: `Fetch a specific URL and return its content. Use after web_search when you need to read a selected result. Supports text (default), markdown, and raw HTML formats. Use allowedDomains when the caller has constrained which sites may be read. Cannot render JavaScript-heavy pages (SPAs). Best for documentation, articles, and static pages. Output truncated to ${formatBytes(TOOLS_MAX_OUTPUT_BYTES)}.`,
    parameters: WebFetchArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params, signal }): Promise<ToolResult> {
      const url = validateUrl(params.url)
      const allowedDomains = validateAllowedDomains(url, params.allowedDomains)

      let response: WebFetchProviderOutput
      try {
        response = await provider.fetch({
          url,
          headers: params.headers,
          signal: signal ?? AbortSignal.timeout(TOOLS_EXECUTE_TIMEOUT_MS),
        })
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text:
                error instanceof Error ? error.message : `Fetch request failed: ${String(error)}`,
            },
          ],
          isError: true,
          details: {
            url: url.href,
            provider: provider.name ?? 'custom',
            allowedDomains,
          },
        }
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          content: [
            {
              type: 'text',
              text: `HTTP ${response.status} ${response.statusText} for ${url.href}`,
            },
          ],
          isError: true,
          details: {
            url: url.href,
            provider: response.provider,
            allowedDomains,
            status: response.status,
            statusText: response.statusText,
          },
        }
      }

      const contentType = response.contentType
      const contentLength = response.contentLength

      if (contentLength > MAX_RESPONSE_BYTES) {
        return {
          content: [
            {
              type: 'text',
              text: `Response too large: ${formatBytes(contentLength)} (limit: ${formatBytes(MAX_RESPONSE_BYTES)})`,
            },
          ],
          isError: true,
        }
      }

      const buffer = response.body
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        return {
          content: [
            {
              type: 'text',
              text: `Response too large: ${formatBytes(buffer.byteLength)} (limit: ${formatBytes(MAX_RESPONSE_BYTES)})`,
            },
          ],
          isError: true,
        }
      }

      const raw = new TextDecoder().decode(buffer)

      let output: string

      if (contentType.includes('application/json')) {
        try {
          output = JSON.stringify(JSON.parse(raw), null, 2)
        } catch {
          output = raw
        }
      } else if (contentType.includes('text/html')) {
        const format = params.format ?? 'text'
        output =
          format === 'raw' ? raw : format === 'markdown' ? htmlToMarkdown(raw) : htmlToText(raw)
      } else {
        output = raw
      }

      const maxChars = params.maxLength ?? TOOLS_MAX_OUTPUT_BYTES
      const truncation = truncateTail(output, {
        maxBytes: Math.min(maxChars, TOOLS_MAX_OUTPUT_BYTES),
        maxLines: Infinity,
      })

      let text = truncation.content
      if (truncation.truncated) {
        text += `\n\n(Content truncated. Showing ${formatBytes(truncation.outputBytes)} of ${formatBytes(truncation.totalBytes)})`
      }

      return {
        content: [{ type: 'text', text }],
        details: {
          url: url.href,
          provider: response.provider,
          allowedDomains,
          contentType,
          size: buffer.byteLength,
          truncation: truncation.truncated ? truncation : undefined,
        },
      }
    },
  }
}
