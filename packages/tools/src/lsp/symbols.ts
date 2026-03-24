import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import { DEFAULT_MAX_SYMBOLS } from './constants'
import { formatDocumentSymbol, formatSymbolInfo } from './lsp-formatters'
import { withLspClient } from './lsp-wrapper'
import type { DocumentSymbol, SymbolInfo } from './types'

const SymbolsArgsSchema = z.object({
  filePath: z.string().describe('File path for LSP context'),
  scope: z
    .enum(['document', 'workspace'])
    .default('document')
    .describe("'document' for file symbols, 'workspace' for project-wide search"),
  query: z.string().optional().describe('Symbol name to search (required for workspace scope)'),
  limit: z.number().int().min(1).max(500).optional().describe('Max results (default 50)'),
})

type SymbolsArgs = z.infer<typeof SymbolsArgsSchema>

export function createLspSymbols(_projectRoot: string): AgentTool<SymbolsArgs> {
  return {
    name: 'lsp_symbols',
    description:
      "Get symbols from file (document) or search across workspace. Use scope='document' for file outline, scope='workspace' for project-wide symbol search.",
    parameters: SymbolsArgsSchema,

    async execute({ params }): Promise<ToolResult> {
      const scope = params.scope ?? 'document'

      if (scope === 'workspace') {
        if (!params.query) {
          return {
            content: [{ type: 'text', text: "Error: 'query' is required for workspace scope" }],
            isError: true,
          }
        }

        const result = await withLspClient(params.filePath, async (client) => {
          return (await client.workspaceSymbols(params.query!)) as SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return { content: [{ type: 'text', text: 'No symbols found' }] }
        }

        const total = result.length
        const limit = Math.min(params.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
        const truncated = total > limit
        const limited = result.slice(0, limit)
        const lines = limited.map(formatSymbolInfo)
        if (truncated) {
          lines.unshift(`Found ${total} symbols (showing first ${limit}):`)
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      // Document symbols
      const result = await withLspClient(params.filePath, async (client) => {
        return (await client.documentSymbols(params.filePath)) as
          | DocumentSymbol[]
          | SymbolInfo[]
          | null
      })

      if (!result || result.length === 0) {
        return { content: [{ type: 'text', text: 'No symbols found' }] }
      }

      const total = result.length
      const limit = Math.min(params.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
      const truncated = total > limit
      const limited = truncated ? result.slice(0, limit) : result

      const lines: string[] = []
      if (truncated) {
        lines.push(`Found ${total} symbols (showing first ${limit}):`)
      }

      if (limited[0] && 'range' in limited[0]) {
        lines.push(...(limited as DocumentSymbol[]).map((s) => formatDocumentSymbol(s)))
      } else {
        lines.push(...(limited as SymbolInfo[]).map(formatSymbolInfo))
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] }
    },
  }
}
