import type { AgentMessage } from '@vitamin/agent'
import type {
  PluginAgentManifest,
  PluginAgentRegistry,
  PluginCommandManifest,
  PluginCommandRegistry,
} from '@vitamin/tools'
import type { AgentSession } from '../session/agent-session'
import type { ContextDiagnostics } from '../session/types'

export interface JsonModeResult {
  sessionId: string
  status: string
  messageCount: number
  response: string
}

export interface RpcPromptParams {
  text: string
}

export type RpcRequest =
  | { id?: string; method: 'prompt'; params: RpcPromptParams }
  | { id?: string; method: 'status' }
  | { id?: string; method: 'abort' }
  | { id?: string; method: 'compact'; params: { summary: string; compactedCount: number } }

export type RpcResponse =
  | { id?: string; ok: true; result: unknown }
  | { id?: string; ok: false; error: string }

export type InteractiveResult =
  | { type: 'response'; text: string }
  | { type: 'system'; text: string }
  | { type: 'exit' }
  | { type: 'noop' }

export interface InteractiveModeOptions {
  pluginAgentRegistry?: PluginAgentRegistry
  pluginCommandRegistry?: PluginCommandRegistry
  requirePluginConfirmation?: boolean
}

const PLUGIN_CONFIRM_FLAG = '--confirm-plugin'

export async function runPrintMode(
  session: AgentSession,
  prompt: string,
  writer: (text: string) => void = (text) => process.stdout.write(`${text}\n`),
): Promise<string> {
  await session.prompt(prompt)
  const response = getLastAssistantText(session.session.messages())
  writer(response)
  return response
}

export async function runJsonMode(session: AgentSession, prompt: string): Promise<JsonModeResult> {
  await session.prompt(prompt)
  return {
    sessionId: session.id,
    status: session.status,
    messageCount: session.session.messages().length,
    response: getLastAssistantText(session.session.messages()),
  }
}

export async function runRpcMode(session: AgentSession, request: RpcRequest): Promise<RpcResponse> {
  try {
    if (request.method === 'prompt') {
      const result = await runJsonMode(session, request.params.text)
      return { id: request.id, ok: true, result }
    }

    if (request.method === 'status') {
      return {
        id: request.id,
        ok: true,
        result: {
          sessionId: session.id,
          status: session.status,
          messageCount: session.session.messages().length,
        },
      }
    }

    if (request.method === 'abort') {
      session.abort()
      return { id: request.id, ok: true, result: { aborted: true } }
    }

    await session.compact(request.params.summary, request.params.compactedCount)
    return {
      id: request.id,
      ok: true,
      result: { compacted: true, messageCount: session.session.messages().length },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { id: request.id, ok: false, error: message }
  }
}

export class InteractiveMode {
  private readonly pluginAgentRegistry?: PluginAgentRegistry
  private readonly pluginCommandRegistry?: PluginCommandRegistry
  private readonly requirePluginConfirmation: boolean

  constructor(
    private readonly session: AgentSession,
    options: InteractiveModeOptions = {},
  ) {
    this.pluginAgentRegistry = options.pluginAgentRegistry
    this.pluginCommandRegistry = options.pluginCommandRegistry
    this.requirePluginConfirmation = options.requirePluginConfirmation ?? false
  }

  async handleInput(input: string): Promise<InteractiveResult> {
    const text = input.trim()
    if (text.length === 0) {
      return { type: 'noop' }
    }

    if (!text.startsWith('/')) {
      const response = await runPrintMode(this.session, text, () => {})
      return { type: 'response', text: response }
    }

    const [command, ...rest] = parseInteractiveSlashInput(text)
    if (!command) {
      return { type: 'noop' }
    }

    if (command === 'exit' || command === 'quit') {
      return { type: 'exit' }
    }

    if (command === 'help') {
      const pluginAgents = this.pluginAgentRegistry?.list() ?? []
      const pluginCommands = this.pluginCommandRegistry?.list() ?? []
      const suffix =
        pluginCommands.length > 0
          ? `\nPlugin commands: ${pluginCommands.map((entry) => `/${entry.command.name}`).join(', ')}`
          : ''
      const agentSuffix =
        pluginAgents.length > 0
          ? `\nPlugin agents: ${pluginAgents.map((entry) => entry.agent.name).join(', ')}`
          : ''
      return {
        type: 'system',
        text: `Commands: /help, /context [--show-prompt], /abort, /compact <count> <summary>, /agent <name> [args], /exit${suffix}${agentSuffix}`,
      }
    }

    if (command === 'context') {
      const includePrompt = rest.includes('--show-prompt')
      return {
        type: 'system',
        text: formatContextDiagnostics(this.session.getContextDiagnostics({ includePrompt })),
      }
    }

    if (command === 'abort') {
      this.session.abort()
      return { type: 'system', text: 'Aborted current run.' }
    }

    if (command === 'compact') {
      const compactedCount = Number(rest[0] ?? '1')
      const summary = rest.slice(1).join(' ') || 'Compacted by interactive mode'
      await this.session.compact(summary, Number.isFinite(compactedCount) ? compactedCount : 1)
      return { type: 'system', text: 'Compaction complete.' }
    }

    if (command === 'agent') {
      const [agentName, ...agentArgs] = rest
      if (!agentName) {
        const pluginAgents = this.pluginAgentRegistry?.list() ?? []
        const names = pluginAgents.map((entry) => entry.agent.name)
        return {
          type: 'system',
          text:
            names.length > 0
              ? `Plugin agents: ${names.join(', ')}`
              : 'No plugin agents registered.',
        }
      }
      const pluginAgent = this.pluginAgentRegistry?.get(agentName)
      if (!pluginAgent) {
        return { type: 'system', text: `Unknown plugin agent: ${agentName}` }
      }
      const confirmation = consumePluginConfirmationFlag(agentArgs)
      if (this.requirePluginConfirmation && !confirmation.confirmed) {
        return {
          type: 'system',
          text: formatPluginConfirmationRequired('agent', pluginAgent.pluginId, agentName),
        }
      }
      const response = await runPrintMode(
        this.session,
        renderPluginAgentPrompt(pluginAgent.agent, confirmation.args),
        () => {},
      )
      return { type: 'response', text: response }
    }

    const pluginCommand = this.pluginCommandRegistry?.get(command)
    if (pluginCommand) {
      const confirmation = consumePluginConfirmationFlag(rest)
      if (this.requirePluginConfirmation && !confirmation.confirmed) {
        return {
          type: 'system',
          text: formatPluginConfirmationRequired('command', pluginCommand.pluginId, command),
        }
      }
      const commandArgs = applyPluginCommandArgumentDefaults(
        pluginCommand.command,
        confirmation.args,
      )
      const missingArguments = getMissingPluginCommandArguments(pluginCommand.command, commandArgs)
      if (missingArguments.length > 0) {
        return {
          type: 'system',
          text: formatPluginCommandMissingArguments(pluginCommand.command, missingArguments),
        }
      }
      const unexpectedArguments = getUnexpectedPluginCommandArguments(
        pluginCommand.command,
        commandArgs,
      )
      if (unexpectedArguments.length > 0) {
        return {
          type: 'system',
          text: formatPluginCommandUnexpectedArguments(pluginCommand.command, unexpectedArguments),
        }
      }
      const invalidArguments = getInvalidPluginCommandArguments(pluginCommand.command, commandArgs)
      if (invalidArguments.length > 0) {
        return {
          type: 'system',
          text: formatPluginCommandInvalidArguments(pluginCommand.command, invalidArguments),
        }
      }
      const response = await runPrintMode(
        this.session,
        renderPluginCommandPrompt(pluginCommand.command, commandArgs),
        () => {},
      )
      return { type: 'response', text: response }
    }

    return { type: 'system', text: `Unknown command: /${command}` }
  }
}

export function parseInteractiveSlashInput(input: string): string[] {
  const text = input.trim()
  const slashless = text.startsWith('/') ? text.slice(1) : text
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaped = false

  for (const char of slashless) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = undefined
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaped) {
    current += '\\'
  }
  if (current.length > 0) {
    tokens.push(current)
  }
  return tokens
}

export function consumePluginConfirmationFlag(args: readonly string[]): {
  confirmed: boolean
  args: string[]
} {
  const filtered = args.filter((arg) => arg !== PLUGIN_CONFIRM_FLAG)
  return { confirmed: filtered.length !== args.length, args: filtered }
}

export function formatPluginConfirmationRequired(
  kind: 'agent' | 'command',
  pluginId: string,
  name: string,
): string {
  return `Plugin ${kind} requires confirmation: ${pluginId}/${name}. Re-run with ${PLUGIN_CONFIRM_FLAG} to execute.`
}

export function getMissingPluginCommandArguments(
  command: PluginCommandManifest,
  args: readonly string[],
): string[] {
  const commandArguments = command.arguments ?? []
  return commandArguments
    .map((argument, index) => ({ argument, index }))
    .filter(({ argument, index }) => argument.required && args[index] === undefined)
    .map(({ argument }) => argument.name)
}

export function formatPluginCommandMissingArguments(
  command: PluginCommandManifest,
  missingArguments: readonly string[],
): string {
  return `Plugin command "/${command.name}" requires arguments: ${missingArguments.join(', ')}. Usage: /${command.name}${formatPluginCommandUsage(command)}`
}

export function getUnexpectedPluginCommandArguments(
  command: PluginCommandManifest,
  args: readonly string[],
): string[] {
  if (!command.arguments) {
    return []
  }
  return args.slice(command.arguments.length)
}

export function formatPluginCommandUnexpectedArguments(
  command: PluginCommandManifest,
  unexpectedArguments: readonly string[],
): string {
  return `Plugin command "/${command.name}" received unexpected arguments: ${unexpectedArguments.join(', ')}. Usage: /${command.name}${formatPluginCommandUsage(command)}`
}

export function applyPluginCommandArgumentDefaults(
  command: PluginCommandManifest,
  args: readonly string[],
): string[] {
  const resolved = [...args]
  for (const [index, argument] of (command.arguments ?? []).entries()) {
    if (resolved[index] === undefined && argument.default !== undefined) {
      resolved[index] = argument.default
    }
  }
  return resolved
}

export interface InvalidPluginCommandArgument {
  name: string
  expectedType: string
  value: string
}

export function getInvalidPluginCommandArguments(
  command: PluginCommandManifest,
  args: readonly string[],
): InvalidPluginCommandArgument[] {
  const invalid: InvalidPluginCommandArgument[] = []
  for (const [index, argument] of (command.arguments ?? []).entries()) {
    const value = args[index]
    if (value === undefined) {
      continue
    }
    if (
      argument.type !== undefined &&
      argument.type !== 'string' &&
      !isPluginCommandArgumentValueType(value, argument.type)
    ) {
      invalid.push({ name: argument.name, expectedType: argument.type, value })
      continue
    }
    if (argument.choices && argument.choices.length > 0 && !argument.choices.includes(value)) {
      invalid.push({
        name: argument.name,
        expectedType: `one of ${argument.choices.join(', ')}`,
        value,
      })
    }
  }
  return invalid
}

export function formatPluginCommandInvalidArguments(
  command: PluginCommandManifest,
  invalidArguments: readonly InvalidPluginCommandArgument[],
): string {
  const details = invalidArguments
    .map(
      (argument) => `${argument.name} expected ${argument.expectedType}, got "${argument.value}"`,
    )
    .join('; ')
  return `Plugin command "/${command.name}" has invalid arguments: ${details}. Usage: /${command.name}${formatPluginCommandUsage(command)}`
}

export function renderPluginCommandPrompt(
  command: PluginCommandManifest,
  args: readonly string[],
): string {
  const argumentsText = args.join(' ')
  const argumentSchema = formatPluginCommandArgumentSchema(command)
  if (command.prompt) {
    const prompt = command.prompt.includes('$ARGUMENTS')
      ? command.prompt.replaceAll('$ARGUMENTS', argumentsText)
      : command.prompt
    const promptWithArguments =
      argumentsText && !command.prompt.includes('$ARGUMENTS')
        ? `${prompt}\n\nArguments: ${argumentsText}`
        : prompt
    return argumentSchema ? `${promptWithArguments}\n\n${argumentSchema}` : promptWithArguments
  }

  const lines = [`Run plugin command "/${command.name}".`]
  if (command.description) {
    lines.push('', command.description)
  }
  if (args.length > 0) {
    lines.push('', `Arguments: ${args.join(' ')}`)
  }
  if (argumentSchema) {
    lines.push('', argumentSchema)
  }
  return lines.join('\n')
}

function formatPluginCommandUsage(command: PluginCommandManifest): string {
  const commandArguments = command.arguments ?? []
  if (commandArguments.length === 0) {
    return ''
  }
  return ` ${commandArguments
    .map((argument) => {
      const type = argument.type ? `:${argument.type}` : ''
      const defaultValue = argument.default !== undefined ? `=${argument.default}` : ''
      const typedName = `${argument.name}${type}${defaultValue}`
      return argument.required ? `<${typedName}>` : `[${typedName}]`
    })
    .join(' ')}`
}

function formatPluginCommandArgumentSchema(command: PluginCommandManifest): string | undefined {
  if (!command.arguments || command.arguments.length === 0) {
    return undefined
  }
  const lines = ['Argument schema:']
  for (const argument of command.arguments) {
    const required = argument.required ? 'required' : 'optional'
    const type = argument.type ?? 'string'
    const choices =
      argument.choices && argument.choices.length > 0
        ? `, choices: ${argument.choices.join(', ')}`
        : ''
    const defaultValue = argument.default !== undefined ? `, default: ${argument.default}` : ''
    const description = argument.description ? `: ${argument.description}` : ''
    lines.push(`- ${argument.name} (${required}, ${type}${choices}${defaultValue})${description}`)
  }
  return lines.join('\n')
}

function isPluginCommandArgumentValueType(
  value: string,
  type: NonNullable<PluginCommandManifest['arguments']>[number]['type'],
): boolean {
  if (type === 'number') {
    return value.trim() !== '' && Number.isFinite(Number(value))
  }
  if (type === 'boolean') {
    return value === 'true' || value === 'false'
  }
  return true
}

export function renderPluginAgentPrompt(
  agent: PluginAgentManifest,
  args: readonly string[],
): string {
  const argumentsText = args.join(' ')
  const lines = [`Run plugin agent "${agent.name}".`]
  if (agent.description) {
    lines.push('', agent.description)
  }
  if (agent.tools && agent.tools.length > 0) {
    lines.push('', `Preferred tools: ${agent.tools.join(', ')}`)
  }
  if (agent.prompt) {
    lines.push('', agent.prompt)
  }
  if (argumentsText) {
    lines.push('', `Task: ${argumentsText}`)
  }
  return lines.join('\n')
}

export function formatContextDiagnostics(diagnostics: ContextDiagnostics): string {
  const lines = [
    `Session: ${diagnostics.sessionId}`,
    `Model: ${diagnostics.model} (${diagnostics.provider})`,
    `Messages: ${diagnostics.messageCount}`,
    `Prompt sections: ${diagnostics.prompt.sectionCount}, estimated tokens: ${diagnostics.prompt.estimatedTokens}`,
    `Prompt cache: static=${diagnostics.prompt.staticPrefixChars} chars, dynamic=${diagnostics.prompt.dynamicTailChars} chars`,
    `Tools: ${diagnostics.tools.count} total, ${diagnostics.tools.deferredCount} deferred`,
    'Sections:',
    ...diagnostics.prompt.sections.map((section) => {
      const cache = section.cacheable ? 'cacheable' : 'dynamic'
      return `- ${section.key} [${section.layer}, ${cache}, ${section.source}] ~${section.estimatedTokens} tokens`
    }),
  ]

  if (diagnostics.prompt.content !== undefined) {
    lines.push('', diagnostics.prompt.content)
  } else {
    lines.push('', 'Prompt content hidden. Use /context --show-prompt to include it.')
  }

  return lines.join('\n')
}

export function getLastAssistantText(messages: readonly AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as {
      role?: string
      content?: Array<{ type?: string; text?: string }>
    }
    if (message?.role !== 'assistant') {
      continue
    }

    const content = message.content ?? []
    const text = content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim()

    if (text.length > 0) {
      return text
    }
  }

  return ''
}
