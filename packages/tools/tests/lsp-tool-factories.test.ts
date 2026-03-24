import { describe, expect, it } from 'vitest'

import { createLspDefinition } from '../src/lsp/definition'
import { createLspDiagnostics } from '../src/lsp/diagnostics'
import { createLspReferences } from '../src/lsp/references'
import { createLspPrepareRename, createLspRename } from '../src/lsp/rename'
import { createLspSymbols } from '../src/lsp/symbols'

describe('lsp tool factories', () => {
  it('creates tools with expected names', () => {
    const tool = createLspDefinition('/tmp')
    const refs = createLspReferences('/tmp')
    const symbols = createLspSymbols('/tmp')
    const diagnostics = createLspDiagnostics('/tmp')
    const prepareRename = createLspPrepareRename('/tmp')
    const rename = createLspRename('/tmp')

    expect(tool.name).toBe('lsp_goto_definition')
    expect(refs.name).toBe('lsp_find_references')
    expect(symbols.name).toBe('lsp_symbols')
    expect(diagnostics.name).toBe('lsp_diagnostics')
    expect(prepareRename.name).toBe('lsp_prepare_rename')
    expect(rename.name).toBe('lsp_rename')
  })

  it('lsp schemas validate expected params', () => {
    const definition = createLspDefinition('/tmp')
    const references = createLspReferences('/tmp')
    const symbols = createLspSymbols('/tmp')
    const diagnostics = createLspDiagnostics('/tmp')
    const prepareRename = createLspPrepareRename('/tmp')
    const rename = createLspRename('/tmp')

    expect(definition.parameters.safeParse({ filePath: '/tmp/a.ts', line: 1, character: 0 }).success).toBe(true)
    expect(definition.parameters.safeParse({ filePath: '/tmp/a.ts', line: 0, character: 0 }).success).toBe(false)

    expect(references.parameters.safeParse({ filePath: '/tmp/a.ts', line: 1, character: 0 }).success).toBe(true)
    expect(references.parameters.safeParse({ filePath: '/tmp/a.ts', line: 1, character: -1 }).success).toBe(false)

    expect(symbols.parameters.safeParse({ filePath: '/tmp/a.ts', scope: 'workspace', query: 'x' }).success).toBe(true)
    expect(symbols.parameters.safeParse({ filePath: '/tmp/a.ts', scope: 'workspace', limit: 0 }).success).toBe(false)

    expect(diagnostics.parameters.safeParse({ filePath: '/tmp/a.ts', severity: 'error' }).success).toBe(true)
    expect(diagnostics.parameters.safeParse({ filePath: '/tmp/a.ts', severity: 'fatal' }).success).toBe(false)

    expect(prepareRename.parameters.safeParse({ filePath: '/tmp/a.ts', line: 1, character: 0 }).success).toBe(true)
    expect(prepareRename.parameters.safeParse({ filePath: '/tmp/a.ts', line: 0, character: 0 }).success).toBe(false)

    expect(rename.parameters.safeParse({ filePath: '/tmp/a.ts', line: 1, character: 0, newName: 'next' }).success).toBe(true)
    expect(rename.parameters.safeParse({ filePath: '/tmp/a.ts', line: 1, character: 0 }).success).toBe(false)
  })

  it('lsp_symbols workspace requires query', async () => {
    const tool = createLspSymbols('/tmp')

    const result = await tool.execute({
      id: 'ls1',
      params: { filePath: '/tmp/a.ts', scope: 'workspace' },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("'query' is required")
  })
})
