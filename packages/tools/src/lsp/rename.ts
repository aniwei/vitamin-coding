import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'
import { formatApplyResult, formatPrepareRenameResult } from './lsp-formatters'
import { withLspClient } from './lsp-wrapper'
import { applyWorkspaceEdit } from './workspace-edit'
import type { PrepareRenameDefaultBehavior, PrepareRenameResult, WorkspaceEdit } from './types'

// ─── Prepare Rename ──────────────────────────────────────────────────────────

const PrepareRenameArgsSchema = z.object({
  filePath: z.string().describe('Absolute path to the file'),
  line: z.number().int().min(1).describe('1-based line number'),
  character: z.number().int().min(0).describe('0-based character offset'),
})

type PrepareRenameArgs = z.infer<typeof PrepareRenameArgsSchema>

export function createLspPrepareRename(_projectRoot: string): AgentTool<PrepareRenameArgs> {
  return {
    name: 'lsp_prepare_rename',
    description: 'Check if rename is valid. Use BEFORE lsp_rename.',
    parameters: PrepareRenameArgsSchema,

    async execute({ params }): Promise<ToolResult> {
      const result = await withLspClient(params.filePath, async (client) => {
        return (await client.prepareRename(params.filePath, params.line, params.character)) as
          | PrepareRenameResult
          | PrepareRenameDefaultBehavior
          | null
      })

      const text = formatPrepareRenameResult(result)
      return { content: [{ type: 'text', text }] }
    },
  }
}

// ─── Rename ──────────────────────────────────────────────────────────────────

const RenameArgsSchema = z.object({
  filePath: z.string().describe('Absolute path to the file'),
  line: z.number().int().min(1).describe('1-based line number'),
  character: z.number().int().min(0).describe('0-based character offset'),
  newName: z.string().describe('New symbol name'),
})

type RenameArgs = z.infer<typeof RenameArgsSchema>

export function createLspRename(_projectRoot: string): AgentTool<RenameArgs> {
  return {
    name: 'lsp_rename',
    description: 'Rename symbol across entire workspace. APPLIES changes to all files.',
    parameters: RenameArgsSchema,

    async execute({ params }): Promise<ToolResult> {
      const edit = await withLspClient(params.filePath, async (client) => {
        return (await client.rename(
          params.filePath,
          params.line,
          params.character,
          params.newName,
        )) as WorkspaceEdit | null
      })

      const result = applyWorkspaceEdit(edit)
      const text = formatApplyResult(result)
      return { content: [{ type: 'text', text }] }
    },
  }
}
