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
  module?: string
  exportName?: string
}

export interface PluginAgentManifest {
  name: string
  description?: string
  tools?: string[]
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
  permissions: PluginPermission[]
  errors: string[]
  warnings: string[]
}

export type PluginLifecycleStepType = 'tool' | 'skill' | 'mcp' | 'hook' | 'command' | 'agent'
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
      for (const filename of MANIFEST_FILENAMES) {
        const manifestPath = join(root, entry.name, filename)
        const discovered = await readManifestFile(manifestPath)
        if (discovered) {
          manifests.push(discovered)
          break
        }
      }
    }
  }

  return { manifests, errors }
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
    pushLifecycleStep(result, 'hook', hook.name, 'skipped', 'hook adapter is not configured')
  }

  for (const command of plan.commands) {
    pushLifecycleStep(
      result,
      'command',
      command.name,
      'skipped',
      'command adapter is not configured',
    )
  }

  for (const agent of plan.agents) {
    pushLifecycleStep(result, 'agent', agent.name, 'skipped', 'agent adapter is not configured')
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
    pushLifecycleStep(result, 'hook', hook.name, 'disabled', 'hook unloaded')
  }
  for (const command of plan.commands) {
    pushLifecycleStep(result, 'command', command.name, 'disabled', 'command unloaded')
  }
  for (const agent of plan.agents) {
    pushLifecycleStep(result, 'agent', agent.name, 'disabled', 'agent unloaded')
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
  if (hooks === undefined) return
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
  if (commands === undefined) return
  if (!Array.isArray(commands)) {
    errors.push('commands must be an array')
    return
  }
  for (const [index, command] of commands.entries()) {
    requireString(command.name, `commands[${index}].name`, errors)
  }
}

function validateAgents(agents: PluginAgentManifest[] | undefined, errors: string[]): void {
  if (agents === undefined) return
  if (!Array.isArray(agents)) {
    errors.push('agents must be an array')
    return
  }
  for (const [index, agent] of agents.entries()) {
    requireString(agent.name, `agents[${index}].name`, errors)
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
