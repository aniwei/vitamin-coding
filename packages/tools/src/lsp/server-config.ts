import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getVitaminHomePath, parseJsonc } from '@vitamin/shared'
import { VITAMIN_PROJECT_ROOT } from '@vitamin/env'
import { BUILTIN_SERVERS, EXT_TO_LANG, LSP_INSTALL_HINTS } from './constants'
import type { ResolvedServer, ServerLookupResult } from './types'

// ─── Config types ────────────────────────────────────────────────────────────

interface LspEntry {
  disabled?: boolean
  command?: string[]
  extensions?: string[]
  priority?: number
  env?: Record<string, string>
  initialization?: Record<string, unknown>
}

interface ConfigJson {
  lsp?: Record<string, LspEntry>
}

type ConfigSource = 'project' | 'user'

interface ServerWithSource extends ResolvedServer {
  source: ConfigSource | 'builtin'
}

// ─── Language helpers ────────────────────────────────────────────────────────

export function getLanguageId(ext: string): string {
  return EXT_TO_LANG[ext] || 'plaintext'
}

// ─── Server installation check ───────────────────────────────────────────────

export function isServerInstalled(command: string[]): boolean {
  if (command.length === 0) return false

  const cmd = command[0]!

  // Absolute paths
  if (cmd.includes('/') || cmd.includes('\\')) {
    if (existsSync(cmd)) return true
  }

  const isWindows = process.platform === 'win32'

  let exts = ['']
  if (isWindows) {
    const pathExt = process.env.PATHEXT || ''
    if (pathExt) {
      const systemExts = pathExt.split(';').filter(Boolean)
      exts = [...new Set([...exts, ...systemExts, '.exe', '.cmd', '.bat', '.ps1'])]
    } else {
      exts = ['', '.exe', '.cmd', '.bat', '.ps1']
    }
  }

  let pathEnv = process.env.PATH || ''
  if (isWindows && !pathEnv) {
    pathEnv = process.env.Path || ''
  }

  const pathSeparator = isWindows ? ';' : ':'
  const paths = pathEnv.split(pathSeparator)

  for (const p of paths) {
    for (const suffix of exts) {
      if (existsSync(join(p, cmd + suffix))) return true
    }
  }

  // Check local project node_modules, vitamin home bin
  const vitaminHome = getVitaminHomePath()
  const additionalBases = [
    join(VITAMIN_PROJECT_ROOT, 'node_modules', '.bin'),
    join(vitaminHome, 'bin'),
    join(vitaminHome, 'node_modules', '.bin'),
  ]

  for (const base of additionalBases) {
    for (const suffix of exts) {
      if (existsSync(join(base, cmd + suffix))) return true
    }
  }

  // Node runtime always available
  if (cmd === 'node') return true

  return false
}

// ─── Config loading ──────────────────────────────────────────────────────────

function loadJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return parseJsonc(readFileSync(path, 'utf-8')) as T
  } catch {
    return null
  }
}

function detectConfigFilePath(base: string): string {
  const jsonc = base + '.jsonc'
  if (existsSync(jsonc)) return jsonc
  const json = base + '.json'
  if (existsSync(json)) return json
  return jsonc // default to .jsonc even if not found
}

export function getConfigPaths(): { project: string; user: string } {
  const vitaminHome = getVitaminHomePath()
  return {
    project: detectConfigFilePath(join(VITAMIN_PROJECT_ROOT, '.vitamin', 'vitamin')),
    user: detectConfigFilePath(join(vitaminHome, 'vitamin')),
  }
}

function loadAllConfigs(): Map<ConfigSource, ConfigJson> {
  const paths = getConfigPaths()
  const configs = new Map<ConfigSource, ConfigJson>()

  const project = loadJsonFile<ConfigJson>(paths.project)
  if (project) configs.set('project', project)

  const user = loadJsonFile<ConfigJson>(paths.user)
  if (user) configs.set('user', user)

  return configs
}

function getMergedServers(): ServerWithSource[] {
  const configs = loadAllConfigs()
  const servers: ServerWithSource[] = []
  const disabled = new Set<string>()
  const seen = new Set<string>()

  const sources: ConfigSource[] = ['project', 'user']

  for (const source of sources) {
    const config = configs.get(source)
    if (!config?.lsp) continue

    for (const [id, entry] of Object.entries(config.lsp)) {
      if (entry.disabled) {
        disabled.add(id)
        continue
      }
      if (seen.has(id)) continue
      if (!entry.command || !entry.extensions) continue

      servers.push({
        id,
        command: entry.command,
        extensions: entry.extensions,
        priority: entry.priority ?? 0,
        env: entry.env,
        initialization: entry.initialization,
        source,
      })
      seen.add(id)
    }
  }

  // Append builtin servers that aren't overridden/disabled
  for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
    if (disabled.has(id) || seen.has(id)) continue
    servers.push({
      id,
      command: config.command,
      extensions: config.extensions,
      priority: -100,
      source: 'builtin',
    })
  }

  return servers.sort((a, b) => {
    if (a.source !== b.source) {
      const order: Record<string, number> = { project: 0, user: 1, builtin: 2 }
      return (order[a.source] ?? 2) - (order[b.source] ?? 2)
    }
    return b.priority - a.priority
  })
}

// ─── Server lookup ───────────────────────────────────────────────────────────

export function findServerForExtension(ext: string): ServerLookupResult {
  const servers = getMergedServers()

  // First pass: installed server that handles this extension
  for (const server of servers) {
    if (server.extensions.includes(ext) && isServerInstalled(server.command)) {
      return {
        status: 'found',
        server: {
          id: server.id,
          command: server.command,
          extensions: server.extensions,
          priority: server.priority,
          env: server.env,
          initialization: server.initialization,
        },
      }
    }
  }

  // Second pass: configured but not installed
  for (const server of servers) {
    if (server.extensions.includes(ext)) {
      const installHint =
        LSP_INSTALL_HINTS[server.id] || `Install '${server.command[0]}' and ensure it's in your PATH`
      return {
        status: 'not_installed',
        server: {
          id: server.id,
          command: server.command,
          extensions: server.extensions,
        },
        installHint,
      }
    }
  }

  const availableServers = [...new Set(servers.map((s) => s.id))]
  return { status: 'not_configured', extension: ext, availableServers }
}

export function getAllServers(): Array<{
  id: string
  installed: boolean
  extensions: string[]
  disabled: boolean
  source: string
  priority: number
}> {
  const configs = loadAllConfigs()
  const servers = getMergedServers()
  const disabled = new Set<string>()

  for (const config of configs.values()) {
    if (!config.lsp) continue
    for (const [id, entry] of Object.entries(config.lsp)) {
      if (entry.disabled) disabled.add(id)
    }
  }

  const result: Array<{
    id: string
    installed: boolean
    extensions: string[]
    disabled: boolean
    source: string
    priority: number
  }> = []

  const seen = new Set<string>()

  for (const server of servers) {
    if (seen.has(server.id)) continue
    result.push({
      id: server.id,
      installed: isServerInstalled(server.command),
      extensions: server.extensions,
      disabled: false,
      source: server.source,
      priority: server.priority,
    })
    seen.add(server.id)
  }

  for (const id of disabled) {
    if (seen.has(id)) continue
    const builtin = BUILTIN_SERVERS[id]
    result.push({
      id,
      installed: builtin ? isServerInstalled(builtin.command) : false,
      extensions: builtin?.extensions || [],
      disabled: true,
      source: 'disabled',
      priority: 0,
    })
  }

  return result
}
