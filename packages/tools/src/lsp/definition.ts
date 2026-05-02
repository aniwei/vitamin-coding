import { z } from 'zod'
import type { AgentTool, ToolResult } from '@x-mars/agent'
import { formatLocation } from './lsp-formatters'
import { withLspClient } from './lsp-wrapper'
import type { Location, LocationLink } from './types'

const DefinitionArgsSchema = z.object({
  filePath: z.string().describe('Absolute path to the file'),
  line: z.number().int().min(1).describe('1-based line number'),
  character: z.number().int().min(0).describe('0-based character offset'),
})

type DefinitionArgs = z.infer<typeof DefinitionArgsSchema>

export function createLspDefinition(_projectRoot: string): AgentTool<DefinitionArgs> {
  return {
    name: 'lsp_goto_definition',
    description: 'Jump to symbol definition. Find WHERE something is defined.',
    parameters: DefinitionArgsSchema,

    async execute({ params }): Promise<ToolResult> {
      const result = await withLspClient(params.filePath, async (client) => {
        return (await client.definition(params.filePath, params.line, params.character)) as
          | Location
          | Location[]
          | LocationLink[]
          | null
      })

      if (!result) {
        return { content: [{ type: 'text', text: 'No definition found' }] }
      }

      const locations = Array.isArray(result) ? result : [result]
      if (locations.length === 0) {
        return { content: [{ type: 'text', text: 'No definition found' }] }
      }

      const text = locations.map(formatLocation).join('\n')
      return { content: [{ type: 'text', text }] }
    },
  }
}
