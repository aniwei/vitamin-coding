import { readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { TextEdit, WorkspaceEdit } from './types'

export interface ApplyResult {
  success: boolean
  filesModified: string[]
  totalEdits: number
  errors: string[]
}

export function uriToPath(uri: string): string {
  return fileURLToPath(uri)
}

function applyTextEditsToFile(
  filePath: string,
  edits: TextEdit[],
): { success: boolean; editCount: number; error?: string } {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    // 倒序应用编辑，确保早期偏移量不受影响
    const sortedEdits = [...edits].sort((a, b) => {
      if (b.range.start.line !== a.range.start.line) {
        return b.range.start.line - a.range.start.line
      }
      return b.range.start.character - a.range.start.character
    })

    for (const edit of sortedEdits) {
      const { start, end } = edit.range

      if (start.line === end.line) {
        const line = lines[start.line] || ''
        lines[start.line] =
          line.substring(0, start.character) + edit.newText + line.substring(end.character)
      } else {
        const firstLine = lines[start.line] || ''
        const lastLine = lines[end.line] || ''
        const newContent =
          firstLine.substring(0, start.character) + edit.newText + lastLine.substring(end.character)
        lines.splice(start.line, end.line - start.line + 1, ...newContent.split('\n'))
      }
    }

    writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return { success: true, editCount: edits.length }
  } catch (err) {
    return {
      success: false,
      editCount: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function applyWorkspaceEdit(edit: WorkspaceEdit | null): ApplyResult {
  if (!edit) {
    return { success: false, filesModified: [], totalEdits: 0, errors: ['No edit provided'] }
  }

  const result: ApplyResult = { success: true, filesModified: [], totalEdits: 0, errors: [] }

  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const filePath = uriToPath(uri)
      const applyResult = applyTextEditsToFile(filePath, edits)

      if (applyResult.success) {
        result.filesModified.push(filePath)
        result.totalEdits += applyResult.editCount
      } else {
        result.success = false
        result.errors.push(`${filePath}: ${applyResult.error}`)
      }
    }
  }

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if ('kind' in change) {
        try {
          if (change.kind === 'create') {
            const filePath = uriToPath(change.uri)
            writeFileSync(filePath, '', 'utf-8')
            result.filesModified.push(filePath)
          } else if (change.kind === 'rename') {
            const oldPath = uriToPath(change.oldUri)
            const newPath = uriToPath(change.newUri)
            renameSync(oldPath, newPath)
            result.filesModified.push(newPath)
          } else if (change.kind === 'delete') {
            const filePath = uriToPath(change.uri)
            unlinkSync(filePath)
            result.filesModified.push(filePath)
          }
        } catch (err) {
          result.success = false
          result.errors.push(`${change.kind} ${(change as { uri?: string }).uri ?? ''}: ${err}`)
        }
      } else {
        const filePath = uriToPath(change.textDocument.uri)
        const applyResult = applyTextEditsToFile(filePath, change.edits)

        if (applyResult.success) {
          result.filesModified.push(filePath)
          result.totalEdits += applyResult.editCount
        } else {
          result.success = false
          result.errors.push(`${filePath}: ${applyResult.error}`)
        }
      }
    }
  }

  return result
}
