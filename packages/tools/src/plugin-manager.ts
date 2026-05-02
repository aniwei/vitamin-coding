import { pathToFileURL } from 'node:url'
import { dirname, resolve, sep } from 'node:path'
import type { AgentTool } from '@vitamin/agent'
import type { HookRegistry, HookSpec } from '@vitamin/hooks'
import type { ToolRegistry } from './tool-registry'
import {
  discoverPluginManifests,
  buildPluginRuntimePlan,
  type DiscoveredPluginManifest,
  type PluginLifecycleResult,
  type PluginManifest,
  type PluginRuntimePlan,
  type PluginHookManifest,
  type PluginToolManifest,
} from './plugin-manifest'

export interface PluginManagerOptions {
  roots: string[]
  toolRegistry: ToolRegistry
  hookRegistry?: HookRegistry
  trustedPluginIds?: string[]
  disabledPluginIds?: string[]
}

export interface LoadedPlugin {
  pluginId: string
  manifestPath: string
  manifest: PluginManifest
  result: PluginLifecycleResult
  hookNames: string[]
}

export interface PluginManagerDiagnostics {
  roots: string[]
  loaded: LoadedPlugin[]
  discovered: DiscoveredPluginManifest[]
  errors: string[]
}

export class PluginManager {
  private readonly roots: string[]
  private readonly toolRegistry: ToolRegistry
  private readonly hookRegistry: HookRegistry | undefined
  private readonly trusted = new Set<string>()
  private readonly disabled = new Set<string>()
  private loaded = new Map<string, LoadedPlugin>()
  private discovered: DiscoveredPluginManifest[] = []
  private errors: string[] = []

  constructor(options: PluginManagerOptions) {
    this.roots = options.roots
    this.toolRegistry = options.toolRegistry
    this.hookRegistry = options.hookRegistry
    this.trusted = new Set(options.trustedPluginIds ?? [])
    this.disabled = new Set(options.disabledPluginIds ?? [])
  }

  async loadAll(): Promise<PluginManagerDiagnostics> {
    const discovery = await discoverPluginManifests(this.roots)
    this.discovered = discovery.manifests
    this.errors = [...discovery.errors]

    for (const item of discovery.manifests) {
      if (!item.manifest || !item.runtimePlan) {
        this.errors.push(...item.validation.errors.map((error) => `${item.path}: ${error}`))
        continue
      }

      const result = await this.loadDiscovered(item)
      if (result.errors.length > 0) {
        this.errors.push(...result.errors.map((error) => `${item.manifest!.id}: ${error}`))
      }
    }

    return this.getDiagnostics()
  }

  async unloadAll(): Promise<void> {
    for (const plugin of this.loaded.values()) {
      for (const tool of plugin.manifest.tools ?? []) {
        const registered = this.toolRegistry.get(tool.name)
        if (registered?.metadata.pluginId === plugin.pluginId) {
          this.toolRegistry.unregister(tool.name)
        }
      }
      for (const hookName of plugin.hookNames) {
        this.hookRegistry?.unregister(hookName)
      }
    }
    this.loaded.clear()
  }

  async reloadAll(): Promise<PluginManagerDiagnostics> {
    await this.unloadAll()
    return this.loadAll()
  }

  enable(pluginId: string): void {
    this.disabled.delete(pluginId)
  }

  disable(pluginId: string): void {
    this.disabled.add(pluginId)
    const plugin = this.loaded.get(pluginId)
    if (!plugin) return
    for (const tool of plugin.manifest.tools ?? []) {
      const registered = this.toolRegistry.get(tool.name)
      if (registered?.metadata.pluginId === pluginId) {
        this.toolRegistry.unregister(tool.name)
      }
    }
    for (const hookName of plugin.hookNames) {
      this.hookRegistry?.unregister(hookName)
    }
    this.loaded.delete(pluginId)
  }

  trust(pluginId: string): void {
    this.trusted.add(pluginId)
  }

  untrust(pluginId: string): void {
    this.trusted.delete(pluginId)
    this.disable(pluginId)
  }

  getDiagnostics(): PluginManagerDiagnostics {
    return {
      roots: [...this.roots],
      loaded: [...this.loaded.values()],
      discovered: [...this.discovered],
      errors: [...this.errors],
    }
  }

  private async loadDiscovered(item: DiscoveredPluginManifest): Promise<PluginLifecycleResult> {
    const manifest = item.manifest!
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
          warning: this.disabled.has(manifest.id) ? 'plugin is disabled by manager' : 'plugin is disabled',
        })
      }
      return result
    }

    if (requiresTrust(manifest) && !this.trusted.has(manifest.id)) {
      const warning = 'plugin requires trust before loading dangerous permissions'
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
      result.warnings.push(`${manifest.id}: ${warning}`)
      return result
    }

    const pluginDir = dirname(item.path)
    for (const toolManifest of manifest.tools ?? []) {
      await this.loadTool(pluginDir, plan, toolManifest, result)
    }
    for (const hookManifest of manifest.hooks ?? []) {
      const hookName = await this.loadHook(pluginDir, hookManifest, result)
      if (hookName) hookNames.push(hookName)
    }
    for (const command of manifest.commands ?? []) {
      result.steps.push({ type: 'command', name: command.name, status: 'loaded' })
    }
    for (const agent of manifest.agents ?? []) {
      result.steps.push({ type: 'agent', name: agent.name, status: 'loaded' })
    }

    this.loaded.set(manifest.id, {
      pluginId: manifest.id,
      manifestPath: item.path,
      manifest,
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
        category: toolManifest.category ?? plan.toolOptions[toolManifest.name]?.category ?? 'plugin',
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
}

export async function importPluginTool(
  pluginDir: string,
  toolManifest: PluginToolManifest,
): Promise<AgentTool> {
  if (!toolManifest.module) {
    throw new Error('tool module is required')
  }

  const modulePath = resolve(pluginDir, toolManifest.module)
  const root = resolve(pluginDir)
  if (modulePath !== root && !modulePath.startsWith(`${root}${sep}`)) {
    throw new Error('tool module must be inside plugin root')
  }

  const mod = await import(pathToFileURL(modulePath).href)
  const exportName = toolManifest.exportName ?? 'default'
  const value = mod[exportName]
  const tool = typeof value === 'function' ? await value() : value

  if (!isAgentTool(tool)) {
    throw new Error(`export "${exportName}" is not a valid AgentTool`)
  }
  if (tool.name !== toolManifest.name) {
    throw new Error(`exported tool name "${tool.name}" does not match manifest "${toolManifest.name}"`)
  }
  return tool
}

export async function importPluginHook(
  pluginDir: string,
  hookManifest: PluginHookManifest,
): Promise<HookSpec> {
  const modulePath = resolvePluginModule(pluginDir, hookManifest.module)
  const mod = await import(pathToFileURL(modulePath).href)
  const exportName = hookManifest.exportName ?? 'default'
  const value = mod[exportName]
  const hook = typeof value === 'function' ? await value() : value

  if (!isHookSpec(hook)) {
    throw new Error(`export "${exportName}" is not a valid HookSpec`)
  }
  if (hook.name !== hookManifest.name) {
    throw new Error(`exported hook name "${hook.name}" does not match manifest "${hookManifest.name}"`)
  }
  if (hook.timing !== hookManifest.timing) {
    throw new Error(`exported hook timing "${hook.timing}" does not match manifest "${hookManifest.timing}"`)
  }
  return hook
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
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AgentTool>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    candidate.parameters !== undefined &&
    typeof candidate.execute === 'function'
  )
}

function isHookSpec(value: unknown): value is HookSpec {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<HookSpec>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.timing === 'string' &&
    typeof candidate.priority === 'number' &&
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.handle === 'function'
  )
}

function resolvePluginModule(pluginDir: string, module: string): string {
  const modulePath = resolve(pluginDir, module)
  const root = resolve(pluginDir)
  if (modulePath !== root && !modulePath.startsWith(`${root}${sep}`)) {
    throw new Error('plugin module must be inside plugin root')
  }
  return modulePath
}

function requiresTrust(manifest: PluginManifest): boolean {
  const permissions = new Set(manifest.permissions ?? [])
  for (const tool of manifest.tools ?? []) {
    for (const permission of tool.permissions ?? []) {
      permissions.add(permission)
    }
  }
  permissions.delete('tools')
  return permissions.size > 0 || (manifest.hooks?.length ?? 0) > 0 || (manifest.mcpServers?.length ?? 0) > 0
}
