import { pathToFileURL } from 'node:url'
import { dirname, resolve, sep } from 'node:path'
import { realpath } from 'node:fs/promises'
import type { AgentTool } from '@x-mars/agent'
import type { HookRegistry, HookSpec } from '@x-mars/hooks'
import type { ToolRegistry } from './tool-registry'
import type { PluginCommandHandler } from './plugin-command-handler'
import {
  discoverPluginManifests,
  buildPluginRuntimePlan,
  type DiscoveredPluginManifest,
  type PluginLifecycleResult,
  type PluginManifest,
  type PluginRuntimePlan,
  type PluginHookManifest,
  type PluginToolManifest,
  type PluginSkillManifest,
  type PluginLifecycleAdapters,
  type PluginCommandManifest,
  type PluginAgentManifest,
  type PluginDevtoolsManifest,
  type PluginLogsManifest,
} from './plugin-manifest'
import type { PluginState } from './plugin-state-store'

export interface PluginManagerOptions {
  roots: string[]
  toolRegistry: ToolRegistry
  hookRegistry?: HookRegistry
  lifecycleAdapters?: PluginLifecycleAdapters
  trustedPluginIds?: string[]
  disabledPluginIds?: string[]
}

export interface LoadedPlugin {
  pluginId: string
  manifestPath: string
  manifest: PluginManifest
  runtimePlan: PluginRuntimePlan
  result: PluginLifecycleResult
  hookNames: string[]
}

export interface PluginManagerDiagnostics {
  roots: string[]
  state: PluginState
  loaded: LoadedPlugin[]
  discovered: DiscoveredPluginManifest[]
  results: PluginLifecycleResult[]
  errors: string[]
}

export class PluginManager {
  private readonly roots: string[]
  private readonly toolRegistry: ToolRegistry
  private readonly hookRegistry: HookRegistry | undefined
  private readonly lifecycleAdapters: PluginLifecycleAdapters
  private readonly trusted = new Set<string>()
  private readonly disabled = new Set<string>()
  private loaded = new Map<string, LoadedPlugin>()
  private results = new Map<string, PluginLifecycleResult>()
  private discovered: DiscoveredPluginManifest[] = []
  private errors: string[] = []

  constructor(options: PluginManagerOptions) {
    this.roots = options.roots
    this.toolRegistry = options.toolRegistry
    this.hookRegistry = options.hookRegistry
    this.lifecycleAdapters = options.lifecycleAdapters ?? {}
    this.trusted = new Set(options.trustedPluginIds ?? [])
    this.disabled = new Set(options.disabledPluginIds ?? [])
  }

  async loadAll(): Promise<PluginManagerDiagnostics> {
    const discovery = await discoverPluginManifests(this.roots)
    this.discovered = discovery.manifests
    this.results.clear()
    this.errors = [...discovery.errors]

    for (const item of discovery.manifests) {
      if (!item.manifest || !item.runtimePlan) {
        this.errors.push(...item.validation.errors.map((error) => `${item.path}: ${error}`))
        continue
      }

      const manifest = item.manifest
      const result = await this.loadDiscovered(item)
      this.results.set(manifest.id, result)
      if (result.errors.length > 0) {
        this.errors.push(...result.errors.map((error) => `${manifest.id}: ${error}`))
      }
    }

    return this.getDiagnostics()
  }

  async unloadAll(): Promise<void> {
    for (const plugin of this.loaded.values()) {
      await this.unloadPlugin(plugin.pluginId)
    }
  }

  async reloadAll(): Promise<PluginManagerDiagnostics> {
    await this.unloadAll()
    return this.loadAll()
  }

  applyState(state: PluginState): void {
    for (const pluginId of state.trustedPluginIds) {
      this.trust(pluginId)
    }
    for (const pluginId of state.disabledPluginIds) {
      this.disabled.add(pluginId)
    }
  }

  getState(): PluginState {
    return {
      trustedPluginIds: [...this.trusted].sort(),
      disabledPluginIds: [...this.disabled].sort(),
    }
  }

  enable(pluginId: string): void {
    this.disabled.delete(pluginId)
  }

  async disable(pluginId: string): Promise<void> {
    this.disabled.add(pluginId)
    await this.unloadPlugin(pluginId)
  }

  private async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loaded.get(pluginId)
    if (!plugin) {
      return
    }
    for (const tool of plugin.manifest.tools ?? []) {
      const registered = this.toolRegistry.get(tool.name)
      if (registered?.metadata.pluginId === pluginId) {
        this.toolRegistry.unregister(tool.name)
      }
    }
    for (const hookName of plugin.hookNames) {
      this.hookRegistry?.unregister(hookName)
    }
    await this.unloadSkills(plugin.runtimePlan)
    await this.disconnectMcpServers(plugin.runtimePlan)
    await this.unregisterCommands(plugin.runtimePlan)
    await this.unregisterAgents(plugin.runtimePlan)
    await this.unregisterDevtools(plugin.runtimePlan)
    await this.unregisterLogs(plugin.runtimePlan)
    this.loaded.delete(pluginId)
  }

  trust(pluginId: string): void {
    this.trusted.add(pluginId)
  }

  async untrust(pluginId: string): Promise<void> {
    this.trusted.delete(pluginId)
    await this.unloadPlugin(pluginId)
  }

  getDiagnostics(): PluginManagerDiagnostics {
    return {
      roots: [...this.roots],
      state: this.getState(),
      loaded: [...this.loaded.values()],
      discovered: [...this.discovered],
      results: [...this.results.values()],
      errors: [...this.errors],
    }
  }

  private async loadDiscovered(item: DiscoveredPluginManifest): Promise<PluginLifecycleResult> {
    if (!item.manifest) {
      throw new Error('plugin manifest is required')
    }
    const manifest = item.manifest
    const plan = item.runtimePlan ?? buildPluginRuntimePlan(manifest)
    const result = createPluginResult(plan)
    const hookNames: string[] = []

    if (plan.errors.length > 0) {
      result.errors.push(...plan.errors)
      return result
    }

    if (!plan.enabled || this.disabled.has(manifest.id)) {
      for (const tool of manifest.tools ?? []) {
        result.steps.push({
          type: 'tool',
          name: tool.name,
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      for (const skill of manifest.skills ?? []) {
        result.steps.push({
          type: 'skill',
          name: skill.name,
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      for (const server of manifest.mcpServers ?? []) {
        result.steps.push({
          type: 'mcp',
          name: server.name,
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      for (const hook of manifest.hooks ?? []) {
        result.steps.push({
          type: 'hook',
          name: hook.name,
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      for (const command of manifest.commands ?? []) {
        result.steps.push({
          type: 'command',
          name: command.name,
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      for (const agent of manifest.agents ?? []) {
        result.steps.push({
          type: 'agent',
          name: agent.name,
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      if (hasDevtoolsContribution(manifest.devtools)) {
        result.steps.push({
          type: 'devtools',
          name: 'devtools',
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      if (hasLogContribution(manifest.logs)) {
        result.steps.push({
          type: 'log',
          name: 'logs',
          status: 'disabled',
          warning: this.disabled.has(manifest.id)
            ? 'plugin is disabled by manager'
            : 'plugin is disabled',
        })
      }
      return result
    }

    if (requiresTrust(manifest) && !this.trusted.has(manifest.id)) {
      const warning = 'plugin requires trust before loading dynamic code or dangerous permissions'
      for (const tool of manifest.tools ?? []) {
        result.steps.push({ type: 'tool', name: tool.name, status: 'skipped', warning })
      }
      for (const hook of manifest.hooks ?? []) {
        result.steps.push({ type: 'hook', name: hook.name, status: 'skipped', warning })
      }
      for (const command of manifest.commands ?? []) {
        result.steps.push({ type: 'command', name: command.name, status: 'skipped', warning })
      }
      for (const agent of manifest.agents ?? []) {
        result.steps.push({ type: 'agent', name: agent.name, status: 'skipped', warning })
      }
      for (const skill of manifest.skills ?? []) {
        result.steps.push({ type: 'skill', name: skill.name, status: 'skipped', warning })
      }
      for (const server of manifest.mcpServers ?? []) {
        result.steps.push({ type: 'mcp', name: server.name, status: 'skipped', warning })
      }
      if (hasDevtoolsContribution(manifest.devtools)) {
        result.steps.push({ type: 'devtools', name: 'devtools', status: 'skipped', warning })
      }
      if (hasLogContribution(manifest.logs)) {
        result.steps.push({ type: 'log', name: 'logs', status: 'skipped', warning })
      }
      result.warnings.push(`${manifest.id}: ${warning}`)
      return result
    }

    const pluginDir = dirname(item.path)
    for (const toolManifest of manifest.tools ?? []) {
      await this.loadTool(pluginDir, plan, toolManifest, result)
    }
    for (const hookManifest of manifest.hooks ?? []) {
      const hookName = await this.loadHook(pluginDir, hookManifest, result)
      if (hookName) {
        hookNames.push(hookName)
      }
    }
    for (const skill of plan.skills) {
      await this.loadSkill(pluginDir, skill, manifest.id, result)
    }
    for (const [name, config] of Object.entries(plan.mcpServers)) {
      await this.connectMcpServer(name, config, manifest.id, result)
    }
    for (const command of manifest.commands ?? []) {
      await this.registerCommand(pluginDir, command, manifest.id, result)
    }
    for (const agent of manifest.agents ?? []) {
      await this.registerAgent(agent, manifest.id, result)
    }
    if (hasDevtoolsContribution(manifest.devtools) && manifest.devtools) {
      await this.registerDevtools(manifest.devtools, manifest.id, result)
    }
    if (hasLogContribution(manifest.logs) && manifest.logs) {
      await this.registerLogs(manifest.logs, manifest.id, result)
    }

    this.loaded.set(manifest.id, {
      pluginId: manifest.id,
      manifestPath: item.path,
      manifest,
      runtimePlan: plan,
      result,
      hookNames,
    })
    return result
  }

  private async loadTool(
    pluginDir: string,
    plan: PluginRuntimePlan,
    toolManifest: PluginToolManifest,
    result: PluginLifecycleResult,
  ): Promise<void> {
    try {
      const tool = await importPluginTool(pluginDir, toolManifest)
      const existing = this.toolRegistry.get(tool.name)
      if (existing && existing.metadata.pluginId !== plan.pluginId) {
        throw new Error(`tool "${tool.name}" is already registered`)
      }

      this.toolRegistry.register(tool, {
        ...plan.toolOptions[toolManifest.name],
        category:
          toolManifest.category ?? plan.toolOptions[toolManifest.name]?.category ?? 'plugin',
      })
      result.steps.push({ type: 'tool', name: tool.name, status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'tool', name: toolManifest.name, status: 'error', error: message })
      result.errors.push(`tool "${toolManifest.name}" failed: ${message}`)
    }
  }

  private async loadHook(
    pluginDir: string,
    hookManifest: PluginHookManifest,
    result: PluginLifecycleResult,
  ): Promise<string | undefined> {
    try {
      if (!this.hookRegistry) {
        result.steps.push({
          type: 'hook',
          name: hookManifest.name,
          status: 'skipped',
          warning: 'hook registry is not configured',
        })
        return undefined
      }
      const hook = await importPluginHook(pluginDir, hookManifest)
      this.hookRegistry.register(hook)
      result.steps.push({ type: 'hook', name: hook.name, status: 'loaded' })
      return hook.name
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'hook', name: hookManifest.name, status: 'error', error: message })
      result.errors.push(`hook "${hookManifest.name}" failed: ${message}`)
      return undefined
    }
  }

  private async loadSkill(
    pluginDir: string,
    skill: PluginSkillManifest,
    pluginId: string,
    result: PluginLifecycleResult,
  ): Promise<void> {
    if (!this.lifecycleAdapters.loadSkill) {
      result.steps.push({
        type: 'skill',
        name: skill.name,
        status: 'skipped',
        warning: 'skill loader adapter is not configured',
      })
      result.warnings.push(`skill "${skill.name}": skill loader adapter is not configured`)
      return
    }
    try {
      const resolvedSkill = { ...skill, path: await resolvePluginModule(pluginDir, skill.path) }
      await this.lifecycleAdapters.loadSkill(resolvedSkill, pluginId)
      result.steps.push({ type: 'skill', name: skill.name, status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'skill', name: skill.name, status: 'error', error: message })
      result.errors.push(`skill "${skill.name}" failed: ${message}`)
    }
  }

  private async connectMcpServer(
    name: string,
    config: PluginRuntimePlan['mcpServers'][string],
    pluginId: string,
    result: PluginLifecycleResult,
  ): Promise<void> {
    if (config.disabled) {
      result.steps.push({
        type: 'mcp',
        name,
        status: 'disabled',
        warning: 'mcp server is disabled',
      })
      return
    }
    if (!this.lifecycleAdapters.connectMcpServer) {
      result.steps.push({
        type: 'mcp',
        name,
        status: 'skipped',
        warning: 'mcp manager adapter is not configured',
      })
      result.warnings.push(`mcp "${name}": mcp manager adapter is not configured`)
      return
    }
    try {
      await this.lifecycleAdapters.connectMcpServer(name, config, pluginId)
      result.steps.push({ type: 'mcp', name, status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'mcp', name, status: 'error', error: message })
      result.errors.push(`mcp "${name}" failed: ${message}`)
    }
  }

  private async registerCommand(
    pluginDir: string,
    command: PluginCommandManifest,
    pluginId: string,
    result: PluginLifecycleResult,
  ): Promise<void> {
    if (!this.lifecycleAdapters.registerCommand) {
      result.steps.push({
        type: 'command',
        name: command.name,
        status: 'skipped',
        warning: 'command adapter is not configured',
      })
      return
    }
    try {
      const handler = command.module
        ? await importPluginCommandHandler(pluginDir, command)
        : undefined
      await this.lifecycleAdapters.registerCommand(command, pluginId, handler)
      result.steps.push({ type: 'command', name: command.name, status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'command', name: command.name, status: 'error', error: message })
      result.errors.push(`command "${command.name}" failed: ${message}`)
    }
  }

  private async registerAgent(
    agent: PluginAgentManifest,
    pluginId: string,
    result: PluginLifecycleResult,
  ): Promise<void> {
    if (!this.lifecycleAdapters.registerAgent) {
      result.steps.push({
        type: 'agent',
        name: agent.name,
        status: 'skipped',
        warning: 'agent adapter is not configured',
      })
      return
    }
    try {
      await this.lifecycleAdapters.registerAgent(agent, pluginId)
      result.steps.push({ type: 'agent', name: agent.name, status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'agent', name: agent.name, status: 'error', error: message })
      result.errors.push(`agent "${agent.name}" failed: ${message}`)
    }
  }

  private async registerDevtools(
    contribution: PluginDevtoolsManifest,
    pluginId: string,
    result: PluginLifecycleResult,
  ): Promise<void> {
    if (!this.lifecycleAdapters.registerDevtools) {
      result.steps.push({
        type: 'devtools',
        name: 'devtools',
        status: 'skipped',
        warning: 'devtools adapter is not configured',
      })
      return
    }
    try {
      await this.lifecycleAdapters.registerDevtools(contribution, pluginId)
      result.steps.push({ type: 'devtools', name: 'devtools', status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'devtools', name: 'devtools', status: 'error', error: message })
      result.errors.push(`devtools contribution failed: ${message}`)
    }
  }

  private async registerLogs(
    contribution: PluginLogsManifest,
    pluginId: string,
    result: PluginLifecycleResult,
  ): Promise<void> {
    if (!this.lifecycleAdapters.registerLogs) {
      result.steps.push({
        type: 'log',
        name: 'logs',
        status: 'skipped',
        warning: 'log adapter is not configured',
      })
      return
    }
    try {
      await this.lifecycleAdapters.registerLogs(contribution, pluginId)
      result.steps.push({ type: 'log', name: 'logs', status: 'loaded' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.steps.push({ type: 'log', name: 'logs', status: 'error', error: message })
      result.errors.push(`log contribution failed: ${message}`)
    }
  }

  private async unloadSkills(plan: PluginRuntimePlan): Promise<void> {
    if (!this.lifecycleAdapters.unloadSkill) {
      return
    }
    for (const skill of plan.skills) {
      await this.lifecycleAdapters.unloadSkill(skill, plan.pluginId)
    }
  }

  private async disconnectMcpServers(plan: PluginRuntimePlan): Promise<void> {
    if (!this.lifecycleAdapters.disconnectMcpServer) {
      return
    }
    for (const name of Object.keys(plan.mcpServers)) {
      await this.lifecycleAdapters.disconnectMcpServer(name, plan.pluginId)
    }
  }

  private async unregisterCommands(plan: PluginRuntimePlan): Promise<void> {
    if (!this.lifecycleAdapters.unregisterCommand) {
      return
    }
    for (const command of plan.commands) {
      await this.lifecycleAdapters.unregisterCommand(command, plan.pluginId)
    }
  }

  private async unregisterAgents(plan: PluginRuntimePlan): Promise<void> {
    if (!this.lifecycleAdapters.unregisterAgent) {
      return
    }
    for (const agent of plan.agents) {
      await this.lifecycleAdapters.unregisterAgent(agent, plan.pluginId)
    }
  }

  private async unregisterDevtools(plan: PluginRuntimePlan): Promise<void> {
    if (!hasDevtoolsContribution(plan.devtools) || !this.lifecycleAdapters.unregisterDevtools) {
      return
    }
    await this.lifecycleAdapters.unregisterDevtools(plan.pluginId)
  }

  private async unregisterLogs(plan: PluginRuntimePlan): Promise<void> {
    if (!hasLogContribution(plan.logs) || !this.lifecycleAdapters.unregisterLogs) {
      return
    }
    await this.lifecycleAdapters.unregisterLogs(plan.pluginId)
  }
}

export async function importPluginTool(
  pluginDir: string,
  toolManifest: PluginToolManifest,
): Promise<AgentTool> {
  if (!toolManifest.module) {
    throw new Error('tool module is required')
  }

  const modulePath = await resolvePluginModule(pluginDir, toolManifest.module)

  const mod = await import(pathToFileURL(modulePath).href)
  const exportName = toolManifest.exportName ?? 'default'
  const value = mod[exportName]
  const tool = typeof value === 'function' ? await value() : value

  if (!isAgentTool(tool)) {
    throw new Error(`export "${exportName}" is not a valid AgentTool`)
  }
  if (tool.name !== toolManifest.name) {
    throw new Error(
      `exported tool name "${tool.name}" does not match manifest "${toolManifest.name}"`,
    )
  }
  return tool
}

export async function importPluginHook(
  pluginDir: string,
  hookManifest: PluginHookManifest,
): Promise<HookSpec> {
  const modulePath = await resolvePluginModule(pluginDir, hookManifest.module)
  const mod = await import(pathToFileURL(modulePath).href)
  const exportName = hookManifest.exportName ?? 'default'
  const value = mod[exportName]
  const hook = typeof value === 'function' ? await value() : value

  if (!isHookSpec(hook)) {
    throw new Error(`export "${exportName}" is not a valid HookSpec`)
  }
  if (hook.name !== hookManifest.name) {
    throw new Error(
      `exported hook name "${hook.name}" does not match manifest "${hookManifest.name}"`,
    )
  }
  if (hook.timing !== hookManifest.timing) {
    throw new Error(
      `exported hook timing "${hook.timing}" does not match manifest "${hookManifest.timing}"`,
    )
  }
  return hook
}

export async function importPluginCommandHandler(
  pluginDir: string,
  commandManifest: PluginCommandManifest,
): Promise<PluginCommandHandler> {
  if (!commandManifest.module) {
    throw new Error('command module is required')
  }

  const modulePath = await resolvePluginModule(pluginDir, commandManifest.module)
  const mod = await import(pathToFileURL(modulePath).href)
  const exportName = commandManifest.exportName ?? 'default'
  const handler = mod[exportName]

  if (typeof handler !== 'function') {
    throw new Error(`export "${exportName}" is not a valid PluginCommandHandler`)
  }
  return handler as PluginCommandHandler
}

export function createPluginManager(options: PluginManagerOptions): PluginManager {
  return new PluginManager(options)
}

function createPluginResult(plan: PluginRuntimePlan): PluginLifecycleResult {
  return {
    pluginId: plan.pluginId,
    enabled: plan.enabled,
    steps: [],
    errors: [],
    warnings: [...plan.warnings],
  }
}

function isAgentTool(value: unknown): value is AgentTool {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<AgentTool>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    candidate.parameters !== undefined &&
    typeof candidate.execute === 'function'
  )
}

function isHookSpec(value: unknown): value is HookSpec {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<HookSpec>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.timing === 'string' &&
    typeof candidate.priority === 'number' &&
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.handle === 'function'
  )
}

async function resolvePluginModule(pluginDir: string, module: string): Promise<string> {
  const modulePath = resolve(pluginDir, module)
  const root = resolve(pluginDir)
  if (modulePath !== root && !modulePath.startsWith(`${root}${sep}`)) {
    throw new Error('plugin module must be inside plugin root')
  }
  const [realRoot, realModulePath] = await Promise.all([realpath(root), realpath(modulePath)])
  if (realModulePath !== realRoot && !realModulePath.startsWith(`${realRoot}${sep}`)) {
    throw new Error('plugin module must be inside plugin root')
  }
  return realModulePath
}

function requiresTrust(manifest: PluginManifest): boolean {
  const permissions = new Set(manifest.permissions ?? [])
  let hasDynamicModule = false
  for (const tool of manifest.tools ?? []) {
    if (tool.module) {
      hasDynamicModule = true
    }
    for (const permission of tool.permissions ?? []) {
      permissions.add(permission)
    }
  }
  for (const hook of manifest.hooks ?? []) {
    if (hook.module) {
      hasDynamicModule = true
    }
  }
  for (const command of manifest.commands ?? []) {
    if (command.module) {
      hasDynamicModule = true
    }
    for (const permission of command.permissions ?? []) {
      permissions.add(permission)
    }
  }
  permissions.delete('tools')
  return (
    hasDynamicModule ||
    permissions.size > 0 ||
    (manifest.mcpServers?.length ?? 0) > 0 ||
    hasDevtoolsContribution(manifest.devtools) ||
    hasLogContribution(manifest.logs)
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
