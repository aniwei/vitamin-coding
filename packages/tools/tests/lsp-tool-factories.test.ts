import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lsp/lsp-wrapper', () => ({
  withLspClient: vi.fn(),
}))

vi.mock('../src/lsp/workspace-edit', () => ({
  applyWorkspaceEdit: vi.fn(),
  uriToPath: (uri: string) => uri.replace('file://', ''),
}))

import { createLspDefinition } from '../src/lsp/definition'
import { createLspDiagnostics } from '../src/lsp/diagnostics'
import { createLspReferences } from '../src/lsp/references'
import { createLspPrepareRename, createLspRename } from '../src/lsp/rename'
import { createLspSymbols } from '../src/lsp/symbols'
import { withLspClient } from '../src/lsp/lsp-wrapper'
import { applyWorkspaceEdit } from '../src/lsp/workspace-edit'

const withLspClientMock = vi.mocked(withLspClient)
const applyWorkspaceEditMock = vi.mocked(applyWorkspaceEdit)

describe('lsp tool factories', () => {
  const signal = new AbortController().signal

  beforeEach(() => {
    withLspClientMock.mockReset()
    applyWorkspaceEditMock.mockReset()
  })

  it('lsp_goto_definition returns no-definition message', async () => {
    withLspClientMock.mockResolvedValueOnce(null)
    const tool = createLspDefinition('/tmp')

    const result = await tool.execute({
      id: 'ld1',
      params: { filePath: '/tmp/a.ts', line: 1, character: 0 },
      signal,
    })

    expect(result.content[0]?.text).toContain('No definition found')
  })

  it('lsp_find_references returns formatted list', async () => {
    withLspClientMock.mockResolvedValueOnce([
      {
        uri: 'file:///tmp/a.ts',
        range: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } },
      },
    ])
    const tool = createLspReferences('/tmp')

    const result = await tool.execute({
      id: 'lr1',
      params: { filePath: '/tmp/a.ts', line: 1, character: 0 },
      signal,
    })

    expect(result.content[0]?.text).toContain('/tmp/a.ts:1:1')
  })

  it('lsp_symbols workspace requires query', async () => {
    const tool = createLspSymbols('/tmp')

    const result = await tool.execute({
      id: 'ls1',
      params: { filePath: '/tmp/a.ts', scope: 'workspace' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("'query' is required")
  })

  it('lsp_symbols document branch formats symbols', async () => {
    withLspClientMock.mockResolvedValueOnce([
      {
        name: 'myFunc',
        kind: 12,
        range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
        selectionRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
      },
    ])
    const tool = createLspSymbols('/tmp')

    const result = await tool.execute({
      id: 'ls2',
      params: { filePath: '/tmp/a.ts', scope: 'document' },
      signal,
    })

    expect(result.content[0]?.text).toContain('myFunc (Function)')
  })

  it('lsp_diagnostics filters by severity', async () => {
    withLspClientMock.mockResolvedValueOnce([
      {
        message: 'warn',
        severity: 2,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      },
      {
        message: 'err',
        severity: 1,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
      },
    ])
    const tool = createLspDiagnostics('/tmp')

    const result = await tool.execute({
      id: 'ld2',
      params: { filePath: '/tmp/a.ts', severity: 'error' },
      signal,
    })

    const text = result.content[0]?.text ?? ''
    expect(text).toContain('err')
    expect(text).not.toContain('warn')
  })

  it('lsp_prepare_rename formats prepare result', async () => {
    withLspClientMock.mockResolvedValueOnce({ defaultBehavior: true })
    const tool = createLspPrepareRename('/tmp')

    const result = await tool.execute({
      id: 'lpr1',
      params: { filePath: '/tmp/a.ts', line: 1, character: 0 },
      signal,
    })

    expect(result.content[0]?.text).toContain('Rename supported')
  })

  it('lsp_rename applies workspace edit and formats result', async () => {
    withLspClientMock.mockResolvedValueOnce({ changes: {} })
    applyWorkspaceEditMock.mockReturnValueOnce({
      success: true,
      filesModified: ['/tmp/a.ts'],
      totalEdits: 1,
      errors: [],
    })

    const tool = createLspRename('/tmp')
    const result = await tool.execute({
      id: 'lrn1',
      params: { filePath: '/tmp/a.ts', line: 1, character: 0, newName: 'nextName' },
      signal,
    })

    expect(result.content[0]?.text).toContain('Applied 1 edit(s) to 1 file(s):')
    expect(result.content[0]?.text).toContain('/tmp/a.ts')
  })
})
