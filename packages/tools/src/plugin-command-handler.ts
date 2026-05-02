import type { PluginCommandInvocation } from './plugin-command-invocation'
import type { PluginCommandManifest } from './plugin-manifest'

export interface PluginCommandHandlerContext {
  pluginId: string
  command: PluginCommandManifest
}

export type PluginCommandHandlerResult =
  | { type: 'prompt'; prompt: string }
  | { type: 'response'; text: string }
  | { type: 'system'; text: string }

export type PluginCommandHandler = (
  invocation: PluginCommandInvocation,
  context: PluginCommandHandlerContext,
) => PluginCommandHandlerResult | Promise<PluginCommandHandlerResult>
