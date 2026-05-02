import { z } from 'zod'
import { DEFAULT_MAX_DIAGNOSTICS } from './constants'
import { filterDiagnosticsBySeverity, formatDiagnostic } from './lsp-formatters'
import { withLspClient } from './lsp-wrapper'
import type { AgentTool, ToolResult } from '@x-mars/agent'
import type { Diagnostic } from './types'

const DiagnosticsArgsSchema = z.object({
  filePath: z.string().describe('Absolute path to the file'),
  severity: z
    .enum(['error', 'warning', 'information', 'hint', 'all'])
    .optional()
    .describe('Filter by severity level'),
})

type DiagnosticsArgs = z.infer<typeof DiagnosticsArgsSchema>

export function createLspDiagnostics(_projectRoot: string): AgentTool<DiagnosticsArgs> {
  return {
    name: 'lsp_diagnostics',
    description: 'Get errors, warnings, hints from language server BEFORE running build.',
    parameters: DiagnosticsArgsSchema,

    async execute({ params }): Promise<ToolResult> {
      const result = await withLspClient(params.filePath, async (client) => {
        return (await client.diagnostics(params.filePath)) as
          | { items?: Diagnostic[] }
          | Diagnostic[]
          | null
      })

      let diagnostics: Diagnostic[] = []
      if (result) {
        if (Array.isArray(result)) {
          diagnostics = result
        } else if (result.items) {
          diagnostics = result.items
        }
      }

      diagnostics = filterDiagnosticsBySeverity(diagnostics, params.severity)

      if (diagnostics.length === 0) {
        return { content: [{ type: 'text', text: 'No diagnostics found' }] }
      }

      const total = diagnostics.length
      const truncated = total > DEFAULT_MAX_DIAGNOSTICS
      const limited = truncated ? diagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS) : diagnostics
      const lines = limited.map(formatDiagnostic)
      if (truncated) {
        lines.unshift(`Found ${total} diagnostics (showing first ${DEFAULT_MAX_DIAGNOSTICS}):`)
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] }
    },
  }
}
