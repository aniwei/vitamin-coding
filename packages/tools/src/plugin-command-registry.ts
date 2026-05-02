import type { PluginAgentManifest, PluginCommandManifest } from './plugin-manifest'
import type { PluginCommandHandler } from './plugin-command-handler'

export interface PluginCommandRegistration {
  pluginId: string
  command: PluginCommandManifest
  handler?: PluginCommandHandler
}

export interface PluginAgentRegistration {
  pluginId: string
  agent: PluginAgentManifest
}

export class PluginCommandRegistry {
  private readonly commands = new Map<string, PluginCommandRegistration>()

  register(command: PluginCommandManifest, pluginId: string, handler?: PluginCommandHandler): void {
    const existing = this.commands.get(command.name)
    if (existing && existing.pluginId !== pluginId) {
      throw new Error(
        `Plugin command "${command.name}" is already registered by plugin "${existing.pluginId}"`,
      )
    }
    this.commands.set(command.name, { pluginId, command: cloneCommand(command), handler })
  }

  unregister(name: string, pluginId: string): void {
    const existing = this.commands.get(name)
    if (existing?.pluginId === pluginId) {
      this.commands.delete(name)
    }
  }

  get(name: string): PluginCommandRegistration | undefined {
    const existing = this.commands.get(name)
    return existing ? cloneCommandRegistration(existing) : undefined
  }

  list(): PluginCommandRegistration[] {
    return [...this.commands.values()]
      .map((entry) => cloneCommandRegistration(entry))
      .sort((a, b) => a.command.name.localeCompare(b.command.name))
  }

  clearPlugin(pluginId: string): void {
    for (const [name, entry] of this.commands.entries()) {
      if (entry.pluginId === pluginId) {
        this.commands.delete(name)
      }
    }
  }
}

export class PluginAgentRegistry {
  private readonly agents = new Map<string, PluginAgentRegistration>()

  register(agent: PluginAgentManifest, pluginId: string): void {
    const existing = this.agents.get(agent.name)
    if (existing && existing.pluginId !== pluginId) {
      throw new Error(
        `Plugin agent "${agent.name}" is already registered by plugin "${existing.pluginId}"`,
      )
    }
    this.agents.set(agent.name, { pluginId, agent: cloneAgent(agent) })
  }

  unregister(name: string, pluginId: string): void {
    const existing = this.agents.get(name)
    if (existing?.pluginId === pluginId) {
      this.agents.delete(name)
    }
  }

  get(name: string): PluginAgentRegistration | undefined {
    const existing = this.agents.get(name)
    return existing ? { pluginId: existing.pluginId, agent: cloneAgent(existing.agent) } : undefined
  }

  list(): PluginAgentRegistration[] {
    return [...this.agents.values()]
      .map((entry) => ({ pluginId: entry.pluginId, agent: cloneAgent(entry.agent) }))
      .sort((a, b) => a.agent.name.localeCompare(b.agent.name))
  }

  clearPlugin(pluginId: string): void {
    for (const [name, entry] of this.agents.entries()) {
      if (entry.pluginId === pluginId) {
        this.agents.delete(name)
      }
    }
  }
}

export function createPluginCommandRegistry(): PluginCommandRegistry {
  return new PluginCommandRegistry()
}

export function createPluginAgentRegistry(): PluginAgentRegistry {
  return new PluginAgentRegistry()
}

function cloneCommand(command: PluginCommandManifest): PluginCommandManifest {
  return {
    ...command,
    permissions: command.permissions ? [...command.permissions] : undefined,
    arguments: command.arguments?.map((arg) => ({
      ...arg,
      choices: arg.choices ? [...arg.choices] : undefined,
    })),
  }
}

function cloneCommandRegistration(entry: PluginCommandRegistration): PluginCommandRegistration {
  const registration: PluginCommandRegistration = {
    pluginId: entry.pluginId,
    command: cloneCommand(entry.command),
  }
  if (entry.handler) {
    registration.handler = entry.handler
  }
  return registration
}

function cloneAgent(agent: PluginAgentManifest): PluginAgentManifest {
  return { ...agent, tools: agent.tools ? [...agent.tools] : undefined }
}
