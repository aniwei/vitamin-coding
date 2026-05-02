import type { ToolPreset } from '@vitamin/setting'
import type { McpServerConfig } from '@vitamin/mcp'
import type { HookTiming } from '@vitamin/hooks'

export type PluginManifestStatus = 'enabled' | 'disabled'
export type PluginPermission = 'tools' | 'network' | 'filesystem' | 'shell' | 'mcp' | 'skills'

export interface PluginToolManifest {
  name: string
  module?: string
  exportName?: string
  preset?: ToolPreset
  category?: string
  shouldDefer?: boolean
  permissions?: PluginPermission[]
}

export interface PluginSkillManifest {
  name: string
  path: string
  trigger?: 'manual' | 'auto'
}

export interface PluginMcpManifest extends McpServerConfig {
  name: string
  disabled?: boolean
}

export interface PluginHookManifest {
  name: string
  timing: HookTiming
  module: string
  exportName?: string
  priority?: number
}

export interface PluginCommandManifest {
  name: string
  description?: string
  prompt?: string
  arguments?: PluginCommandArgumentManifest[]
  module?: string
  exportName?: string
}

export interface PluginCommandArgumentManifest {
  name: string
  description?: string
  required?: boolean
  type?: 'string' | 'number' | 'boolean'
}

export interface PluginAgentManifest {
  name: string
  description?: string
  prompt?: string
  tools?: string[]
}

export interface PluginDevtoolsPanelManifest {
  name: string
  title: string
  path?: string
}

export interface PluginDevtoolsProviderManifest {
  name: string
  kind: 'diagnostics' | 'timeline'
  description?: string
}

export interface PluginDevtoolsActionManifest {
  name: string
  title: string
  description?: string
}

export interface PluginDevtoolsManifest {
  panels?: PluginDevtoolsPanelManifest[]
  providers?: PluginDevtoolsProviderManifest[]
  actions?: PluginDevtoolsActionManifest[]
}

export interface PluginLogSinkManifest {
  name: string
  kind?: 'memory' | 'devtools' | 'custom'
  permissions?: Array<'network' | 'filesystem'>
}

export interface PluginLogFormatterManifest {
  name: string
  mediaType?: string
}

export interface PluginLogViewerManifest {
  name: string
  title: string
}

export interface PluginLogsManifest {
  sinks?: PluginLogSinkManifest[]
  formatters?: PluginLogFormatterManifest[]
  viewers?: PluginLogViewerManifest[]
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  status?: PluginManifestStatus
  tools?: PluginToolManifest[]
  skills?: PluginSkillManifest[]
  mcpServers?: PluginMcpManifest[]
  hooks?: PluginHookManifest[]
  commands?: PluginCommandManifest[]
  agents?: PluginAgentManifest[]
  devtools?: PluginDevtoolsManifest
  logs?: PluginLogsManifest
  permissions?: PluginPermission[]
}

export interface PluginManifestValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PluginManifestSummary {
  id: string
  name: string
  version: string
  enabled: boolean
  toolCount: number
  skillCount: number
  mcpServerCount: number
  hookCount: number
  commandCount: number
  agentCount: number
  devtoolsPanelCount: number
  devtoolsProviderCount: number
  devtoolsActionCount: number
  logSinkCount: number
  logFormatterCount: number
  logViewerCount: number
  permissions: PluginPermission[]
  deferredTools: string[]
}

export interface PluginRuntimePlan {
  pluginId: string
  enabled: boolean
  toolOptions: Record<
    string,
    { pluginId: string; preset?: ToolPreset; category?: string; shouldDefer?: boolean }
  >
  skills: PluginSkillManifest[]
  mcpServers: Record<string, McpServerConfig & { disabled?: boolean }>
  hooks: PluginHookManifest[]
  commands: PluginCommandManifest[]
  agents: PluginAgentManifest[]
  devtools?: PluginDevtoolsManifest
  logs?: PluginLogsManifest
  permissions: PluginPermission[]
  errors: string[]
  warnings: string[]
}

export type PluginLifecycleStepType =
  | 'tool'
  | 'skill'
  | 'mcp'
  | 'hook'
  | 'command'
  | 'agent'
  | 'devtools'
  | 'log'
export type PluginLifecycleStepStatus = 'loaded' | 'disabled' | 'skipped' | 'error'

export interface PluginLifecycleStep {
  type: PluginLifecycleStepType
  name: string
  status: PluginLifecycleStepStatus
  error?: string
  warning?: string
}

export interface PluginLifecycleResult {
  pluginId: string
  enabled: boolean
  steps: PluginLifecycleStep[]
  errors: string[]
  warnings: string[]
}

export interface PluginLifecycleAdapters {
  registerToolOptions?: (
    name: string,
    options: PluginRuntimePlan['toolOptions'][string],
  ) => void | Promise<void>
  unregisterTool?: (name: string, pluginId: string) => void | Promise<void>
  loadSkill?: (skill: PluginSkillManifest, pluginId: string) => void | Promise<void>
  unloadSkill?: (skill: PluginSkillManifest, pluginId: string) => void | Promise<void>
  connectMcpServer?: (
    name: string,
    config: McpServerConfig & { disabled?: boolean },
    pluginId: string,
  ) => void | Promise<void>
  disconnectMcpServer?: (name: string, pluginId: string) => void | Promise<void>
  loadHook?: (hook: PluginHookManifest, pluginId: string) => void | Promise<void>
  unloadHook?: (hook: PluginHookManifest, pluginId: string) => void | Promise<void>
  registerCommand?: (command: PluginCommandManifest, pluginId: string) => void | Promise<void>
  unregisterCommand?: (command: PluginCommandManifest, pluginId: string) => void | Promise<void>
  registerAgent?: (agent: PluginAgentManifest, pluginId: string) => void | Promise<void>
  unregisterAgent?: (agent: PluginAgentManifest, pluginId: string) => void | Promise<void>
  registerDevtools?: (
    contribution: PluginDevtoolsManifest,
    pluginId: string,
  ) => void | Promise<void>
  unregisterDevtools?: (pluginId: string) => void | Promise<void>
  registerLogs?: (contribution: PluginLogsManifest, pluginId: string) => void | Promise<void>
  unregisterLogs?: (pluginId: string) => void | Promise<void>
}

export interface DiscoveredPluginManifest {
  path: string
  manifest: PluginManifest | null
  validation: PluginManifestValidation
  runtimePlan?: PluginRuntimePlan
}

export interface PluginDiscoveryResult {
  manifests: DiscoveredPluginManifest[]
  errors: string[]
}

const MANIFEST_FILENAMES = ['plugin.json', 'vitamin-plugin.json']

const VALID_PERMISSIONS = new Set<PluginPermission>([
  'tools',
  'network',
  'filesystem',
  'shell',
  'mcp',
  'skills',
])

export function validatePluginManifest(manifest: unknown): PluginManifestValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['manifest must be an object'], warnings }
  }

  const value = manifest as Partial<PluginManifest>
  requireString(value.id, 'id', errors)
  requireString(value.name, 'name', errors)
  requireString(value.version, 'version', errors)

  if (value.status && value.status !== 'enabled' && value.status !== 'disabled') {
    errors.push('status must be enabled or disabled')
  }

  validatePermissions(value.permissions, 'permissions', errors)
  validateTools(value.tools, errors, warnings)
  validateSkills(value.skills, errors)
  validateMcpServers(value.mcpServers, errors, warnings)
  validateHooks(value.hooks, errors)
  validateCommands(value.commands, errors)
  validateAgents(value.agents, errors)
  validateDevtools(value.devtools, errors)
  validateLogs(value.logs, errors)
  detectManifestConflicts(value, errors)

  return { valid: errors.length === 0, errors, warnings }
}

export function summarizePluginManifest(manifest: PluginManifest): PluginManifestSummary {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: manifest.status !== 'disabled',
    toolCount: manifest.tools?.length ?? 0,
    skillCount: manifest.skills?.length ?? 0,
    mcpServerCount: manifest.mcpServers?.length ?? 0,
    hookCount: manifest.hooks?.length ?? 0,
    commandCount: manifest.commands?.length ?? 0,
    agentCount: manifest.agents?.length ?? 0,
    devtoolsPanelCount: manifest.devtools?.panels?.length ?? 0,
    devtoolsProviderCount: manifest.devtools?.providers?.length ?? 0,
    devtoolsActionCount: manifest.devtools?.actions?.length ?? 0,
    logSinkCount: manifest.logs?.sinks?.length ?? 0,
    logFormatterCount: manifest.logs?.formatters?.length ?? 0,
    logViewerCount: manifest.logs?.viewers?.length ?? 0,
    permissions: manifest.permissions ?? [],
    deferredTools: (manifest.tools ?? [])
      .filter((tool) => tool.shouldDefer)
      .map((tool) => tool.name),
  }
}

export function getPluginLoadErrors(manifest: unknown): string[] {
  return validatePluginManifest(manifest).errors
}

export function buildPluginRuntimePlan(manifest: PluginManifest): PluginRuntimePlan {
  const validation = validatePluginManifest(manifest)
  const toolOptions: PluginRuntimePlan['toolOptions'] = {}
  for (const tool of manifest.tools ?? []) {
    toolOptions[tool.name] = {
      pluginId: manifest.id,
      preset: tool.preset,
      category: tool.category,
      shouldDefer: tool.shouldDefer,
    }
  }

  const mcpServers: PluginRuntimePlan['mcpServers'] = {}
  for (const server of manifest.mcpServers ?? []) {
    const { name, ...config } = server
    mcpServers[name] = config
  }

  return {
    pluginId: manifest.id,
    enabled: manifest.status !== 'disabled',
    toolOptions,
    skills: manifest.skills ?? [],
    mcpServers,
    hooks: manifest.hooks ?? [],
    commands: manifest.commands ?? [],
    agents: manifest.agents ?? [],
    devtools: manifest.devtools,
    logs: manifest.logs,
    permissions: manifest.permissions ?? [],
    errors: validation.errors,
    warnings: validation.warnings,
  }
}

export async function discoverPluginManifests(roots: string[]): Promise<PluginDiscoveryResult> {
  const { readdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const manifests: DiscoveredPluginManifest[] = []
  const errors: string[] = []

  for (const root of roots) {
    const rootManifest = await readManifestFromDir(root)
    if (rootManifest) {
      manifests.push(rootManifest)
      continue
    }

    let entries: Array<{ name: string; isDirectory: () => boolean }>
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch (error) {
      errors.push(`Cannot read plugin root "${root}": ${errorMessage(error)}`)
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const discovered = await readManifestFromDir(join(root, entry.name))
      if (discovered) {
        manifests.push(discovered)
      }
    }
  }

  return { manifests, errors }
}

async function readManifestFromDir(dir: string): Promise<DiscoveredPluginManifest | null> {
  const { join } = await import('node:path')
  for (const filename of MANIFEST_FILENAMES) {
    const manifestPath = join(dir, filename)
    const discovered = await readManifestFile(manifestPath)
    if (discovered) {
      return discovered
    }
  }
  return null
}

export async function applyPluginRuntimePlan(
  plan: PluginRuntimePlan,
  adapters: PluginLifecycleAdapters = {},
): Promise<PluginLifecycleResult> {
  const result = createLifecycleResult(plan, plan.enabled)
  if (plan.errors.length > 0) {
    for (const error of plan.errors) {
      result.errors.push(error)
    }
    addAllPlanEntries(plan, result, 'error', 'plugin runtime plan is invalid')
    return result
  }

  if (!plan.enabled) {
    addAllPlanEntries(plan, result, 'disabled', 'plugin is disabled')
    return result
  }

  for (const [name, options] of Object.entries(plan.toolOptions)) {
    if (!adapters.registerToolOptions) {
      pushLifecycleStep(
        result,
        'tool',
        name,
        'skipped',
        'tool registration adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'tool', name, 'loaded', () =>
      adapters.registerToolOptions?.(name, options),
    )
  }

  for (const skill of plan.skills) {
    if (!adapters.loadSkill) {
      pushLifecycleStep(
        result,
        'skill',
        skill.name,
        'skipped',
        'skill loader adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'skill', skill.name, 'loaded', () =>
      adapters.loadSkill?.(skill, plan.pluginId),
    )
  }

  for (const [name, config] of Object.entries(plan.mcpServers)) {
    if (config.disabled) {
      pushLifecycleStep(result, 'mcp', name, 'disabled', 'mcp server is disabled')
      continue
    }
    if (!adapters.connectMcpServer) {
      pushLifecycleStep(result, 'mcp', name, 'skipped', 'mcp manager adapter is not configured')
      continue
    }
    await runLifecycleStep(result, 'mcp', name, 'loaded', () =>
      adapters.connectMcpServer?.(name, config, plan.pluginId),
    )
  }

  for (const hook of plan.hooks) {
    if (!adapters.loadHook) {
      pushLifecycleStep(result, 'hook', hook.name, 'skipped', 'hook adapter is not configured')
      continue
    }
    await runLifecycleStep(result, 'hook', hook.name, 'loaded', () =>
      adapters.loadHook?.(hook, plan.pluginId),
    )
  }

  for (const command of plan.commands) {
    if (!adapters.registerCommand) {
      pushLifecycleStep(
        result,
        'command',
        command.name,
        'skipped',
        'command adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'command', command.name, 'loaded', () =>
      adapters.registerCommand?.(command, plan.pluginId),
    )
  }

  for (const agent of plan.agents) {
    if (!adapters.registerAgent) {
      pushLifecycleStep(result, 'agent', agent.name, 'skipped', 'agent adapter is not configured')
      continue
    }
    await runLifecycleStep(result, 'agent', agent.name, 'loaded', () =>
      adapters.registerAgent?.(agent, plan.pluginId),
    )
  }

  if (hasDevtoolsContribution(plan.devtools) && plan.devtools) {
    const devtools = plan.devtools
    if (!adapters.registerDevtools) {
      pushLifecycleStep(
        result,
        'devtools',
        'devtools',
        'skipped',
        'devtools adapter is not configured',
      )
    } else {
      await runLifecycleStep(result, 'devtools', 'devtools', 'loaded', () =>
        adapters.registerDevtools?.(devtools, plan.pluginId),
      )
    }
  }

  if (hasLogContribution(plan.logs) && plan.logs) {
    const logs = plan.logs
    if (!adapters.registerLogs) {
      pushLifecycleStep(result, 'log', 'logs', 'skipped', 'log adapter is not configured')
    } else {
      await runLifecycleStep(result, 'log', 'logs', 'loaded', () =>
        adapters.registerLogs?.(logs, plan.pluginId),
      )
    }
  }

  return result
}

export async function disablePluginRuntimePlan(
  plan: PluginRuntimePlan,
  adapters: PluginLifecycleAdapters = {},
): Promise<PluginLifecycleResult> {
  const result = createLifecycleResult(plan, false)

  for (const name of Object.keys(plan.toolOptions)) {
    if (!adapters.unregisterTool) {
      pushLifecycleStep(
        result,
        'tool',
        name,
        'skipped',
        'tool unregister adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'tool', name, 'disabled', () =>
      adapters.unregisterTool?.(name, plan.pluginId),
    )
  }

  for (const skill of plan.skills) {
    if (!adapters.unloadSkill) {
      pushLifecycleStep(
        result,
        'skill',
        skill.name,
        'skipped',
        'skill unload adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'skill', skill.name, 'disabled', () =>
      adapters.unloadSkill?.(skill, plan.pluginId),
    )
  }

  for (const name of Object.keys(plan.mcpServers)) {
    if (!adapters.disconnectMcpServer) {
      pushLifecycleStep(result, 'mcp', name, 'skipped', 'mcp disconnect adapter is not configured')
      continue
    }
    await runLifecycleStep(result, 'mcp', name, 'disabled', () =>
      adapters.disconnectMcpServer?.(name, plan.pluginId),
    )
  }
  for (const hook of plan.hooks) {
    if (!adapters.unloadHook) {
      pushLifecycleStep(
        result,
        'hook',
        hook.name,
        'skipped',
        'hook unload adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'hook', hook.name, 'disabled', () =>
      adapters.unloadHook?.(hook, plan.pluginId),
    )
  }
  for (const command of plan.commands) {
    if (!adapters.unregisterCommand) {
      pushLifecycleStep(
        result,
        'command',
        command.name,
        'skipped',
        'command unregister adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'command', command.name, 'disabled', () =>
      adapters.unregisterCommand?.(command, plan.pluginId),
    )
  }
  for (const agent of plan.agents) {
    if (!adapters.unregisterAgent) {
      pushLifecycleStep(
        result,
        'agent',
        agent.name,
        'skipped',
        'agent unregister adapter is not configured',
      )
      continue
    }
    await runLifecycleStep(result, 'agent', agent.name, 'disabled', () =>
      adapters.unregisterAgent?.(agent, plan.pluginId),
    )
  }
  if (hasDevtoolsContribution(plan.devtools)) {
    if (!adapters.unregisterDevtools) {
      pushLifecycleStep(
        result,
        'devtools',
        'devtools',
        'skipped',
        'devtools unregister adapter is not configured',
      )
    } else {
      await runLifecycleStep(result, 'devtools', 'devtools', 'disabled', () =>
        adapters.unregisterDevtools?.(plan.pluginId),
      )
    }
  }
  if (hasLogContribution(plan.logs)) {
    if (!adapters.unregisterLogs) {
      pushLifecycleStep(
        result,
        'log',
        'logs',
        'skipped',
        'log unregister adapter is not configured',
      )
    } else {
      await runLifecycleStep(result, 'log', 'logs', 'disabled', () =>
        adapters.unregisterLogs?.(plan.pluginId),
      )
    }
  }

  return result
}

async function readManifestFile(path: string): Promise<DiscoveredPluginManifest | null> {
  const { readFile } = await import('node:fs/promises')

  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      path,
      manifest: null,
      validation: {
        valid: false,
        errors: [`Invalid JSON: ${errorMessage(error)}`],
        warnings: [],
      },
    }
  }

  const validation = validatePluginManifest(parsed)
  return {
    path,
    manifest: validation.valid ? (parsed as PluginManifest) : null,
    validation,
    runtimePlan: validation.valid ? buildPluginRuntimePlan(parsed as PluginManifest) : undefined,
  }
}

function createLifecycleResult(plan: PluginRuntimePlan, enabled: boolean): PluginLifecycleResult {
  return {
    pluginId: plan.pluginId,
    enabled,
    steps: [],
    errors: [],
    warnings: [...plan.warnings],
  }
}

function addAllPlanEntries(
  plan: PluginRuntimePlan,
  result: PluginLifecycleResult,
  status: PluginLifecycleStepStatus,
  warning: string,
): void {
  for (const name of Object.keys(plan.toolOptions)) {
    pushLifecycleStep(result, 'tool', name, status, warning)
  }
  for (const skill of plan.skills) {
    pushLifecycleStep(result, 'skill', skill.name, status, warning)
  }
  for (const name of Object.keys(plan.mcpServers)) {
    pushLifecycleStep(result, 'mcp', name, status, warning)
  }
  for (const hook of plan.hooks) {
    pushLifecycleStep(result, 'hook', hook.name, status, warning)
  }
  for (const command of plan.commands) {
    pushLifecycleStep(result, 'command', command.name, status, warning)
  }
  for (const agent of plan.agents) {
    pushLifecycleStep(result, 'agent', agent.name, status, warning)
  }
  if (hasDevtoolsContribution(plan.devtools)) {
    pushLifecycleStep(result, 'devtools', 'devtools', status, warning)
  }
  if (hasLogContribution(plan.logs)) {
    pushLifecycleStep(result, 'log', 'logs', status, warning)
  }
}

async function runLifecycleStep(
  result: PluginLifecycleResult,
  type: PluginLifecycleStepType,
  name: string,
  successStatus: PluginLifecycleStepStatus,
  action: () => void | Promise<void>,
): Promise<void> {
  try {
    await action()
    pushLifecycleStep(result, type, name, successStatus)
  } catch (error) {
    const message = errorMessage(error)
    result.steps.push({ type, name, status: 'error', error: message })
    result.errors.push(`${type} "${name}" failed: ${message}`)
  }
}

function pushLifecycleStep(
  result: PluginLifecycleResult,
  type: PluginLifecycleStepType,
  name: string,
  status: PluginLifecycleStepStatus,
  warning?: string,
): void {
  result.steps.push({ type, name, status, warning })
  if (warning && (status === 'skipped' || status === 'disabled')) {
    result.warnings.push(`${type} "${name}": ${warning}`)
  }
}

function validateTools(
  tools: PluginToolManifest[] | undefined,
  errors: string[],
  warnings: string[],
): void {
  if (tools === undefined) {
    return
  }
  if (!Array.isArray(tools)) {
    errors.push('tools must be an array')
    return
  }

  for (const [index, tool] of tools.entries()) {
    requireString(tool.name, `tools[${index}].name`, errors)
    if (!tool.module) {
      warnings.push(`tools[${index}].module is missing; loader must provide tool implementation`)
    }
    validatePermissions(tool.permissions, `tools[${index}].permissions`, errors)
  }
}

function validateSkills(skills: PluginSkillManifest[] | undefined, errors: string[]): void {
  if (skills === undefined) {
    return
  }
  if (!Array.isArray(skills)) {
    errors.push('skills must be an array')
    return
  }

  for (const [index, skill] of skills.entries()) {
    requireString(skill.name, `skills[${index}].name`, errors)
    requireString(skill.path, `skills[${index}].path`, errors)
    if (skill.trigger && skill.trigger !== 'manual' && skill.trigger !== 'auto') {
      errors.push(`skills[${index}].trigger must be manual or auto`)
    }
  }
}

function validateMcpServers(
  servers: PluginMcpManifest[] | undefined,
  errors: string[],
  warnings: string[],
): void {
  if (servers === undefined) {
    return
  }
  if (!Array.isArray(servers)) {
    errors.push('mcpServers must be an array')
    return
  }

  for (const [index, server] of servers.entries()) {
    requireString(server.name, `mcpServers[${index}].name`, errors)
    if (!server.command && !server.url && !server.disabled) {
      warnings.push(`mcpServers[${index}] has no command or url and will not connect`)
    }
  }
}

function validateHooks(hooks: PluginHookManifest[] | undefined, errors: string[]): void {
  if (hooks === undefined) {
    return
  }
  if (!Array.isArray(hooks)) {
    errors.push('hooks must be an array')
    return
  }
  for (const [index, hook] of hooks.entries()) {
    requireString(hook.name, `hooks[${index}].name`, errors)
    requireString(hook.timing, `hooks[${index}].timing`, errors)
    requireString(hook.module, `hooks[${index}].module`, errors)
  }
}

function validateCommands(commands: PluginCommandManifest[] | undefined, errors: string[]): void {
  if (commands === undefined) {
    return
  }
  if (!Array.isArray(commands)) {
    errors.push('commands must be an array')
    return
  }
  for (const [index, command] of commands.entries()) {
    requireString(command.name, `commands[${index}].name`, errors)
    if (command.prompt !== undefined) {
      requireString(command.prompt, `commands[${index}].prompt`, errors)
    }
    validateCommandArguments(command.arguments, `commands[${index}].arguments`, errors)
  }
}

function validateCommandArguments(
  args: PluginCommandArgumentManifest[] | undefined,
  field: string,
  errors: string[],
): void {
  if (args === undefined) {
    return
  }
  if (!Array.isArray(args)) {
    errors.push(`${field} must be an array`)
    return
  }
  for (const [index, arg] of args.entries()) {
    requireString(arg.name, `${field}[${index}].name`, errors)
    if (arg.description !== undefined) {
      requireString(arg.description, `${field}[${index}].description`, errors)
    }
    if (arg.required !== undefined && typeof arg.required !== 'boolean') {
      errors.push(`${field}[${index}].required must be a boolean`)
    }
    if (
      arg.type !== undefined &&
      arg.type !== 'string' &&
      arg.type !== 'number' &&
      arg.type !== 'boolean'
    ) {
      errors.push(`${field}[${index}].type must be string, number or boolean`)
    }
  }
}

function validateAgents(agents: PluginAgentManifest[] | undefined, errors: string[]): void {
  if (agents === undefined) {
    return
  }
  if (!Array.isArray(agents)) {
    errors.push('agents must be an array')
    return
  }
  for (const [index, agent] of agents.entries()) {
    requireString(agent.name, `agents[${index}].name`, errors)
    if (agent.prompt !== undefined) {
      requireString(agent.prompt, `agents[${index}].prompt`, errors)
    }
  }
}

function validateDevtools(devtools: PluginDevtoolsManifest | undefined, errors: string[]): void {
  if (devtools === undefined) {
    return
  }
  if (!devtools || typeof devtools !== 'object' || Array.isArray(devtools)) {
    errors.push('devtools must be an object')
    return
  }

  validateDevtoolsPanels(devtools.panels, errors)
  validateDevtoolsProviders(devtools.providers, errors)
  validateDevtoolsActions(devtools.actions, errors)
}

function validateDevtoolsPanels(
  panels: PluginDevtoolsPanelManifest[] | undefined,
  errors: string[],
): void {
  if (panels === undefined) {
    return
  }
  if (!Array.isArray(panels)) {
    errors.push('devtools.panels must be an array')
    return
  }
  for (const [index, panel] of panels.entries()) {
    requireString(panel.name, `devtools.panels[${index}].name`, errors)
    requireString(panel.title, `devtools.panels[${index}].title`, errors)
  }
}

function validateDevtoolsProviders(
  providers: PluginDevtoolsProviderManifest[] | undefined,
  errors: string[],
): void {
  if (providers === undefined) {
    return
  }
  if (!Array.isArray(providers)) {
    errors.push('devtools.providers must be an array')
    return
  }
  for (const [index, provider] of providers.entries()) {
    requireString(provider.name, `devtools.providers[${index}].name`, errors)
    if (provider.kind !== 'diagnostics' && provider.kind !== 'timeline') {
      errors.push(`devtools.providers[${index}].kind must be diagnostics or timeline`)
    }
  }
}

function validateDevtoolsActions(
  actions: PluginDevtoolsActionManifest[] | undefined,
  errors: string[],
): void {
  if (actions === undefined) {
    return
  }
  if (!Array.isArray(actions)) {
    errors.push('devtools.actions must be an array')
    return
  }
  for (const [index, action] of actions.entries()) {
    requireString(action.name, `devtools.actions[${index}].name`, errors)
    requireString(action.title, `devtools.actions[${index}].title`, errors)
  }
}

function validateLogs(logs: PluginLogsManifest | undefined, errors: string[]): void {
  if (logs === undefined) {
    return
  }
  if (!logs || typeof logs !== 'object' || Array.isArray(logs)) {
    errors.push('logs must be an object')
    return
  }
  validateLogSinks(logs.sinks, errors)
  validateLogFormatters(logs.formatters, errors)
  validateLogViewers(logs.viewers, errors)
}

function validateLogSinks(sinks: PluginLogSinkManifest[] | undefined, errors: string[]): void {
  if (sinks === undefined) {
    return
  }
  if (!Array.isArray(sinks)) {
    errors.push('logs.sinks must be an array')
    return
  }
  for (const [index, sink] of sinks.entries()) {
    requireString(sink.name, `logs.sinks[${index}].name`, errors)
    if (sink.kind && sink.kind !== 'memory' && sink.kind !== 'devtools' && sink.kind !== 'custom') {
      errors.push(`logs.sinks[${index}].kind must be memory, devtools or custom`)
    }
    if (sink.permissions) {
      for (const permission of sink.permissions) {
        if (permission !== 'network' && permission !== 'filesystem') {
          errors.push(
            `logs.sinks[${index}].permissions contains invalid permission: ${String(permission)}`,
          )
        }
      }
    }
  }
}

function validateLogFormatters(
  formatters: PluginLogFormatterManifest[] | undefined,
  errors: string[],
): void {
  if (formatters === undefined) {
    return
  }
  if (!Array.isArray(formatters)) {
    errors.push('logs.formatters must be an array')
    return
  }
  for (const [index, formatter] of formatters.entries()) {
    requireString(formatter.name, `logs.formatters[${index}].name`, errors)
  }
}

function validateLogViewers(
  viewers: PluginLogViewerManifest[] | undefined,
  errors: string[],
): void {
  if (viewers === undefined) {
    return
  }
  if (!Array.isArray(viewers)) {
    errors.push('logs.viewers must be an array')
    return
  }
  for (const [index, viewer] of viewers.entries()) {
    requireString(viewer.name, `logs.viewers[${index}].name`, errors)
    requireString(viewer.title, `logs.viewers[${index}].title`, errors)
  }
}

function validatePermissions(
  permissions: PluginPermission[] | undefined,
  field: string,
  errors: string[],
): void {
  if (permissions === undefined) {
    return
  }
  if (!Array.isArray(permissions)) {
    errors.push(`${field} must be an array`)
    return
  }
  for (const permission of permissions) {
    if (!VALID_PERMISSIONS.has(permission)) {
      errors.push(`${field} contains invalid permission: ${String(permission)}`)
    }
  }
}

function detectManifestConflicts(manifest: Partial<PluginManifest>, errors: string[]): void {
  detectDuplicate(
    (manifest.tools ?? []).map((tool) => tool.name),
    'tools.name',
    errors,
  )
  detectDuplicate(
    (manifest.skills ?? []).map((skill) => skill.name),
    'skills.name',
    errors,
  )
  detectDuplicate(
    (manifest.mcpServers ?? []).map((server) => server.name),
    'mcpServers.name',
    errors,
  )
  detectDuplicate(
    (manifest.hooks ?? []).map((hook) => hook.name),
    'hooks.name',
    errors,
  )
  detectDuplicate(
    (manifest.commands ?? []).map((command) => command.name),
    'commands.name',
    errors,
  )
  detectDuplicate(
    (manifest.agents ?? []).map((agent) => agent.name),
    'agents.name',
    errors,
  )
  detectDuplicate(
    (manifest.devtools?.panels ?? []).map((panel) => panel.name),
    'devtools.panels.name',
    errors,
  )
  detectDuplicate(
    (manifest.devtools?.providers ?? []).map((provider) => provider.name),
    'devtools.providers.name',
    errors,
  )
  detectDuplicate(
    (manifest.devtools?.actions ?? []).map((action) => action.name),
    'devtools.actions.name',
    errors,
  )
  detectDuplicate(
    (manifest.logs?.sinks ?? []).map((sink) => sink.name),
    'logs.sinks.name',
    errors,
  )
  detectDuplicate(
    (manifest.logs?.formatters ?? []).map((formatter) => formatter.name),
    'logs.formatters.name',
    errors,
  )
  detectDuplicate(
    (manifest.logs?.viewers ?? []).map((viewer) => viewer.name),
    'logs.viewers.name',
    errors,
  )
}

function hasDevtoolsContribution(devtools: PluginDevtoolsManifest | undefined): boolean {
  return (
    (devtools?.panels?.length ?? 0) > 0 ||
    (devtools?.providers?.length ?? 0) > 0 ||
    (devtools?.actions?.length ?? 0) > 0
  )
}

function hasLogContribution(logs: PluginLogsManifest | undefined): boolean {
  return (
    (logs?.sinks?.length ?? 0) > 0 ||
    (logs?.formatters?.length ?? 0) > 0 ||
    (logs?.viewers?.length ?? 0) > 0
  )
}

function detectDuplicate(values: string[], field: string, errors: string[]): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`${field} contains duplicate value: ${value}`)
    }
    seen.add(value)
  }
}

function requireString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} is required`)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
