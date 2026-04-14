import { resolve, extname, dirname, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { LSPClient, lspManager } from './lsp-client'
import { findServerForExtension } from './server-config'
import type { ServerLookupResult } from './types'

const WORKSPACE_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
]

export function findWorkspaceRoot(filePath: string): string {
  let dir = resolve(filePath)

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    dir = dirname(dir)
  }

  let prevDir = ''
  while (dir !== prevDir) {
    for (const marker of WORKSPACE_MARKERS) {
      if (existsSync(join(dir, marker))) {
        return dir
      }
    }
    prevDir = dir
    dir = dirname(dir)
  }

  return dirname(resolve(filePath))
}

export function formatServerLookupError(
  result: Exclude<ServerLookupResult, { status: 'found' }>,
): string {
  if (result.status === 'not_installed') {
    const { server, installHint } = result
    return [
      `LSP server '${server.id}' is configured but NOT INSTALLED.`,
      '',
      `Command not found: ${server.command[0]}`,
      '',
      'To install:',
      `  ${installHint}`,
      '',
      `Supported extensions: ${server.extensions.join(', ')}`,
      '',
      'After installation, the server will be available automatically.',
    ].join('\n')
  }

  return [
    `No LSP server configured for extension: ${result.extension}`,
    '',
    `Available servers: ${result.availableServers.slice(0, 10).join(', ')}${result.availableServers.length > 10 ? '...' : ''}`,
    '',
    "To add a custom server, configure 'lsp' in vitamin.jsonc:",
    '  {',
    '    "lsp": {',
    '      "my-server": {',
    '        "command": ["my-lsp", "--stdio"],',
    `        "extensions": ["${result.extension}"]`,
    '      }',
    '    }',
    '  }',
  ].join('\n')
}

export async function withLspClient<T>(
  filePath: string,
  fn: (client: LSPClient) => Promise<T>,
): Promise<T> {
  const absPath = resolve(filePath)
  const ext = extname(absPath)
  const result = findServerForExtension(ext)

  if (result.status !== 'found') {
    throw new Error(formatServerLookupError(result))
  }

  const server = result.server
  const root = findWorkspaceRoot(absPath)
  const client = await lspManager.getClient(root, server)

  try {
    return await fn(client)
  } catch (e) {
    if (e instanceof Error && e.message.includes('timeout')) {
      const isInitializing = lspManager.isServerInitializing(root, server.id)
      if (isInitializing) {
        throw new Error(
          'LSP server is still initializing. Please retry in a few seconds. ' +
            `Original error: ${e.message}`,
        )
      }
    }
    throw e
  } finally {
    lspManager.releaseClient(root, server.id)
  }
}
