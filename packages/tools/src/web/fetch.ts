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
  maxLength: z
    .number()
    .int()
    .min(1000)
    .max(500_000)
    .optional()
    .describe('Maximum output length in characters'),
})

type WebFetchArgs = z.infer<typeof WebFetchArgsSchema>

export function createWebFetch(_projectRoot: string): AgentTool<WebFetchArgs> {
  return {
    name: 'web_fetch',
    description: `Fetch a web page and return its content. Supports text (default), markdown, and raw HTML formats. Cannot render JavaScript-heavy pages (SPAs). Best for documentation, articles, and static pages. Output truncated to ${formatBytes(TOOLS_MAX_OUTPUT_BYTES)}.`,
    parameters: WebFetchArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params, signal }): Promise<ToolResult> {
      const url = validateUrl(params.url)

      const response = await fetch(url.href, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'text/html, application/json, text/plain, */*',
          ...params.headers,
        },
        signal: signal ?? AbortSignal.timeout(TOOLS_EXECUTE_TIMEOUT_MS),
        redirect: 'follow',
      })

      if (!response.ok) {
        return {
          content: [
            {
              type: 'text',
              text: `HTTP ${response.status} ${response.statusText} for ${url.href}`,
            },
          ],
          isError: true,
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10)

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

      const buffer = await response.arrayBuffer()
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
          contentType,
          size: buffer.byteLength,
          truncation: truncation.truncated ? truncation : undefined,
        },
      }
    },
  }
}
