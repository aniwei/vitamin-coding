import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import { DEFAULT_MAX_REFERENCES } from './constants'
import { formatLocation } from './lsp-formatters'
import { withLspClient } from './lsp-wrapper'
import type { Location } from './types'

const ReferencesArgsSchema = z.object({
  filePath: z.string().describe('Absolute path to the file'),
  line: z.number().int().min(1).describe('1-based line number'),
  character: z.number().int().min(0).describe('0-based character offset'),
  includeDeclaration: z
    .boolean()
    .optional()
    .describe('Include the declaration itself (default true)'),
})

type ReferencesArgs = z.infer<typeof ReferencesArgsSchema>

export function createLspReferences(_projectRoot: string): AgentTool<ReferencesArgs> {
  return {
    name: 'lsp_find_references',
    description: 'Find ALL usages/references of a symbol across the entire workspace.',
    parameters: ReferencesArgsSchema,

    async execute({ params }): Promise<ToolResult> {
      const result = await withLspClient(params.filePath, async (client) => {
        return (await client.references(
          params.filePath,
          params.line,
          params.character,
          params.includeDeclaration ?? true,
        )) as Location[] | null
      })

      if (!result || result.length === 0) {
        return { content: [{ type: 'text', text: 'No references found' }] }
      }

      const total = result.length
      const truncated = total > DEFAULT_MAX_REFERENCES
      const limited = truncated ? result.slice(0, DEFAULT_MAX_REFERENCES) : result
      const lines = limited.map(formatLocation)
      if (truncated) {
        lines.unshift(`Found ${total} references (showing first ${DEFAULT_MAX_REFERENCES}):`)
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] }
    },
  }
}
