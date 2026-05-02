import { access, readdir, readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { McpServerConfig } from '@vitamin/mcp'
import type {
  PluginAgentManifest,
  PluginCommandArgumentManifest,
  PluginCommandManifest,
  PluginManifest,
  PluginMcpManifest,
  PluginSkillManifest,
} from './plugin-manifest'

export interface ClaudeCodePluginImportOptions {
  dataDir?: string
}

export interface ClaudeCodePluginImportReport {
  sourceDir: string
  manifestPath?: string
  imported: {
    skills: string[]
    commands: string[]
    agents: string[]
    mcpServers: string[]
  }
  unsupported: Array<{ component: string; reason: string; path?: string }>
  warnings: string[]
}

export interface ClaudeCodePluginImportResult {
  manifest: PluginManifest
  report: ClaudeCodePluginImportReport
}

type ClaudeManifest = Record<string, unknown>

const CLAUDE_MANIFEST_PATH = join('.claude-plugin', 'plugin.json')
const DEFAULT_SKILLS_DIR = './skills'
const DEFAULT_COMMANDS_DIR = './commands'
const DEFAULT_AGENTS_DIR = './agents'
const DEFAULT_MCP_PATH = './.mcp.json'

export async function importClaudeCodePlugin(
  sourceDir: string,
  options: ClaudeCodePluginImportOptions = {},
): Promise<ClaudeCodePluginImportResult> {
  const root = resolve(sourceDir)
  const report = createReport(root)
  const { manifest: claudeManifest, path: manifestPath } = await readClaudeManifest(root, report)
  if (manifestPath) {
    report.manifestPath = manifestPath
  }

  const id = getString(claudeManifest.name) ?? basename(root)
  const version = getString(claudeManifest.version) ?? '0.0.0'
  const name = getString(claudeManifest.description) ?? id

  const skills = await discoverSkills(root, claudeManifest, report)
  const commands = await discoverCommands(root, claudeManifest, report)
  const agents = await discoverAgents(root, claudeManifest, report)
  const mcpServers = await discoverMcpServers(root, claudeManifest, options, report)
  await collectUnsupportedComponents(root, claudeManifest, report)

  return {
    manifest: {
      id,
      name,
      version,
      skills,
      commands,
      agents,
      mcpServers,
      permissions: mcpServers.length > 0 ? ['mcp'] : undefined,
    },
    report,
  }
}

async function readClaudeManifest(
  root: string,
  report: ClaudeCodePluginImportReport,
): Promise<{ manifest: ClaudeManifest; path?: string }> {
  const path = join(root, CLAUDE_MANIFEST_PATH)
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      report.warnings.push(
        `${CLAUDE_MANIFEST_PATH} is not an object; deriving plugin metadata from directory`,
      )
      return { manifest: {} }
    }
    return { manifest: parsed as ClaudeManifest, path }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      report.warnings.push(
        `${CLAUDE_MANIFEST_PATH} is missing; deriving plugin metadata from directory`,
      )
      return { manifest: {} }
    }
    throw error
  }
}

async function discoverSkills(
  root: string,
  manifest: ClaudeManifest,
  report: ClaudeCodePluginImportReport,
): Promise<PluginSkillManifest[]> {
  const paths = normalizeComponentPaths(manifest.skills, DEFAULT_SKILLS_DIR)
  const files: string[] = []
  for (const path of paths) {
    await collectSkillFiles(root, path, files, report)
  }

  const skills: PluginSkillManifest[] = []
  for (const file of unique(files).sort()) {
    const name = (await readFrontmatterName(file)) ?? basename(dirname(file))
    const relativePath = toPluginRelativePath(root, file)
    if (!relativePath) {
      report.warnings.push(`Skipping skill outside plugin root: ${file}`)
      continue
    }
    skills.push({ name, path: relativePath, trigger: 'manual' })
    report.imported.skills.push(name)
  }
  return skills
}

async function discoverCommands(
  root: string,
  manifest: ClaudeManifest,
  report: ClaudeCodePluginImportReport,
): Promise<PluginCommandManifest[]> {
  const paths = normalizeComponentPaths(manifest.commands, DEFAULT_COMMANDS_DIR)
  const files: string[] = []
  for (const path of paths) {
    await collectMarkdownFiles(root, path, files, report)
  }

  const commands: PluginCommandManifest[] = []
  for (const file of unique(files).sort()) {
    const document = await readMarkdownDocument(file)
    const frontmatter = document.frontmatter
    const name = getString(frontmatter.name) ?? basename(file, extname(file))
    const description = getString(frontmatter.description)
    const commandArguments = getCommandArguments(frontmatter)
    commands.push({ name, description, prompt: document.body, arguments: commandArguments })
    report.imported.commands.push(name)
  }
  return commands
}

async function discoverAgents(
  root: string,
  manifest: ClaudeManifest,
  report: ClaudeCodePluginImportReport,
): Promise<PluginAgentManifest[]> {
  const paths = normalizeComponentPaths(manifest.agents, DEFAULT_AGENTS_DIR)
  const files: string[] = []
  for (const path of paths) {
    await collectMarkdownFiles(root, path, files, report)
  }

  const agents: PluginAgentManifest[] = []
  for (const file of unique(files).sort()) {
    const document = await readMarkdownDocument(file)
    const frontmatter = document.frontmatter
    const name = getString(frontmatter.name) ?? basename(file, extname(file))
    const description = getString(frontmatter.description)
    const tools = getStringArray(frontmatter.tools)
    agents.push({ name, description, prompt: document.body, tools })
    report.imported.agents.push(name)
  }
  return agents
}

async function discoverMcpServers(
  root: string,
  manifest: ClaudeManifest,
  options: ClaudeCodePluginImportOptions,
  report: ClaudeCodePluginImportReport,
): Promise<PluginMcpManifest[]> {
  const specs =
    manifest.mcpServers === undefined ? [DEFAULT_MCP_PATH] : toArray(manifest.mcpServers)
  const serverMaps: Array<Record<string, unknown>> = []

  for (const spec of specs) {
    if (typeof spec === 'string') {
      const path = resolveComponentPath(root, spec, report)
      if (!path) {
        continue
      }
      const parsed = await readJsonIfExists(path)
      if (parsed === undefined) {
        continue
      }
      const map = extractMcpServerMap(parsed)
      if (map) {
        serverMaps.push(map)
      } else {
        report.warnings.push(`MCP config is not a server map: ${path}`)
      }
      continue
    }
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      const map = extractMcpServerMap(spec)
      if (map) {
        serverMaps.push(map)
      }
    }
  }

  const servers: PluginMcpManifest[] = []
  for (const map of serverMaps) {
    for (const [name, rawConfig] of Object.entries(map)) {
      if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
        report.warnings.push(`Skipping MCP server "${name}" because its config is not an object`)
        continue
      }
      const config = normalizeMcpConfig(rawConfig as Record<string, unknown>, root, options, report)
      servers.push({ name, ...config })
      report.imported.mcpServers.push(name)
    }
  }
  return servers
}

async function collectUnsupportedComponents(
  root: string,
  manifest: ClaudeManifest,
  report: ClaudeCodePluginImportReport,
): Promise<void> {
  for (const component of [
    'hooks',
    'lspServers',
    'monitors',
    'themes',
    'outputStyles',
    'channels',
    'userConfig',
    'dependencies',
  ]) {
    if (manifest[component] !== undefined) {
      report.unsupported.push({
        component,
        reason:
          'Vitamin compat importer records this Claude Code component but does not map it to runtime behavior yet',
      })
    }
  }
  for (const [path, component] of [
    ['hooks/hooks.json', 'hooks'],
    ['.lsp.json', 'lspServers'],
    ['monitors/monitors.json', 'monitors'],
    ['settings.json', 'settings'],
    ['bin', 'bin'],
  ] as const) {
    await reportUnsupportedIfExists(root, path, component, report)
  }
}

async function reportUnsupportedIfExists(
  root: string,
  path: string,
  component: string,
  report: ClaudeCodePluginImportReport,
): Promise<void> {
  try {
    await access(join(root, path))
    report.unsupported.push({
      component,
      path: `./${path}`,
      reason: 'Claude Code component exists but Vitamin does not import this component type yet',
    })
  } catch {
    // ignore missing optional component
  }
}

async function collectSkillFiles(
  root: string,
  spec: string,
  files: string[],
  report: ClaudeCodePluginImportReport,
): Promise<void> {
  const path = resolveComponentPath(root, spec, report)
  if (!path) {
    return
  }
  if (await exists(join(path, 'SKILL.md'))) {
    files.push(join(path, 'SKILL.md'))
    return
  }
  for (const entry of await readDirIfExists(path)) {
    if (!entry.isDirectory()) {
      continue
    }
    const skillPath = join(path, entry.name, 'SKILL.md')
    if (await exists(skillPath)) {
      files.push(skillPath)
    }
  }
}

async function collectMarkdownFiles(
  root: string,
  spec: string,
  files: string[],
  report: ClaudeCodePluginImportReport,
): Promise<void> {
  const path = resolveComponentPath(root, spec, report)
  if (!path) {
    return
  }
  if (extname(path) === '.md') {
    if (await exists(path)) {
      files.push(path)
    }
    return
  }
  for (const entry of await readDirIfExists(path)) {
    if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(join(path, entry.name))
    }
  }
}

function normalizeMcpConfig(
  raw: Record<string, unknown>,
  root: string,
  options: ClaudeCodePluginImportOptions,
  report: ClaudeCodePluginImportReport,
): McpServerConfig {
  const config: McpServerConfig = {}
  if (typeof raw.command === 'string') {
    config.command = substituteClaudeVariables(raw.command, root, options, report)
  }
  if (Array.isArray(raw.args)) {
    config.args = raw.args
      .filter((arg): arg is string => typeof arg === 'string')
      .map((arg) => substituteClaudeVariables(arg, root, options, report))
  }
  if (raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env)) {
    config.env = {}
    for (const [key, value] of Object.entries(raw.env)) {
      if (typeof value === 'string') {
        config.env[key] = substituteClaudeVariables(value, root, options, report)
      }
    }
  }
  if (typeof raw.url === 'string') {
    config.url = substituteClaudeVariables(raw.url, root, options, report)
  }
  if (typeof raw.requestTimeoutMs === 'number') {
    config.requestTimeoutMs = raw.requestTimeoutMs
  }
  if (typeof raw.autoReconnect === 'boolean') {
    config.autoReconnect = raw.autoReconnect
  }
  if (typeof raw.maxReconnectAttempts === 'number') {
    config.maxReconnectAttempts = raw.maxReconnectAttempts
  }
  if (raw.cwd !== undefined) {
    report.unsupported.push({
      component: 'mcpServers.cwd',
      reason:
        'Vitamin McpServerConfig does not support cwd; command/args were imported without cwd',
    })
  }
  return config
}

function substituteClaudeVariables(
  value: string,
  root: string,
  options: ClaudeCodePluginImportOptions,
  report: ClaudeCodePluginImportReport,
): string {
  let result = value.replaceAll('${CLAUDE_PLUGIN_ROOT}', root)
  if (result.includes('${CLAUDE_PLUGIN_DATA}')) {
    if (options.dataDir) {
      result = result.replaceAll('${CLAUDE_PLUGIN_DATA}', options.dataDir)
    } else {
      report.warnings.push('Found ${CLAUDE_PLUGIN_DATA}; pass dataDir to replace it during import')
    }
  }
  if (/\$\{user_config\.[^}]+}/.test(result)) {
    report.warnings.push(
      'Found ${user_config.*}; Vitamin importer leaves user configuration placeholders unchanged',
    )
  }
  return result
}

function extractMcpServerMap(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const object = value as Record<string, unknown>
  const maybeNested = object.mcpServers
  if (maybeNested && typeof maybeNested === 'object' && !Array.isArray(maybeNested)) {
    return maybeNested as Record<string, unknown>
  }
  return object
}

async function readFrontmatterName(file: string): Promise<string | undefined> {
  return getString((await readFrontmatter(file)).name)
}

async function readFrontmatter(file: string): Promise<Record<string, unknown>> {
  return (await readMarkdownDocument(file)).frontmatter
}

async function readMarkdownDocument(
  file: string,
): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const raw = await readFile(file, 'utf-8')
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw.trim() }
  }
  const lines = raw.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      const parsed = parseYaml(lines.slice(1, i).join('\n'))
      const frontmatter =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {}
      return {
        frontmatter,
        body: lines
          .slice(i + 1)
          .join('\n')
          .trim(),
      }
    }
  }
  return { frontmatter: {}, body: raw.trim() }
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function normalizeComponentPaths(value: unknown, defaultPath: string): string[] {
  if (value === undefined) {
    return [defaultPath]
  }
  return toArray(value).filter((item): item is string => typeof item === 'string')
}

function resolveComponentPath(
  root: string,
  spec: string,
  report: ClaudeCodePluginImportReport,
): string | undefined {
  if (!spec.startsWith('./')) {
    report.warnings.push(`Skipping non-relative Claude Code component path: ${spec}`)
    return undefined
  }
  const path = resolve(root, spec)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    report.warnings.push(`Skipping component path outside plugin root: ${spec}`)
    return undefined
  }
  return path
}

function toPluginRelativePath(root: string, path: string): string | undefined {
  const rel = relative(root, path)
  if (rel.startsWith('..') || rel === '') {
    return undefined
  }
  return `./${rel.split(sep).join('/')}`
}

async function readDirIfExists(
  path: string,
): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>> {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function createReport(sourceDir: string): ClaudeCodePluginImportReport {
  return {
    sourceDir,
    imported: { skills: [], commands: [], agents: [], mcpServers: [] },
    unsupported: [],
    warnings: [],
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((item): item is string => typeof item === 'string')
}

function getCommandArguments(
  frontmatter: Record<string, unknown>,
): PluginCommandArgumentManifest[] | undefined {
  const explicit = normalizeCommandArguments(frontmatter.arguments)
  if (explicit) {
    return explicit
  }
  const hint = getString(frontmatter['argument-hint'])
  if (!hint) {
    return undefined
  }
  const args: PluginCommandArgumentManifest[] = []
  for (const match of hint.matchAll(/<([^>]+)>|\[([^\]]+)]/g)) {
    const requiredName = match[1]?.trim()
    const optionalName = match[2]?.trim()
    const name = requiredName || optionalName
    if (name) {
      args.push({ name, required: Boolean(requiredName) })
    }
  }
  return args.length > 0 ? args : undefined
}

function normalizeCommandArguments(value: unknown): PluginCommandArgumentManifest[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const args: PluginCommandArgumentManifest[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      args.push({ name: item.trim() })
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const object = item as Record<string, unknown>
    const name = getString(object.name)
    if (!name) {
      continue
    }
    args.push({
      name,
      description: getString(object.description),
      required: typeof object.required === 'boolean' ? object.required : undefined,
      type: getCommandArgumentType(object.type),
    })
  }
  return args.length > 0 ? args : undefined
}

function getCommandArgumentType(
  value: unknown,
): PluginCommandArgumentManifest['type'] | undefined {
  return value === 'string' || value === 'number' || value === 'boolean' ? value : undefined
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
