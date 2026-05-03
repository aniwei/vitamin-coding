import type { AgentMessage, AgentSessionEvent } from '@x-mars/agent'
import type {
  PermissionAuditLog,
  PermissionContext,
  PermissionDecision,
  PermissionPolicyRegistry,
} from '@x-mars/hooks'
import {
  buildPluginCommandInvocation,
  consumePluginConfirmationFlag,
  formatPluginCommandInvocationError,
  type PluginAgentManifest,
  type PluginAgentRegistry,
  type PluginCommandInvocation,
  type PluginCommandManifest,
  type PluginCommandRegistration,
  type PluginCommandRegistry,
} from '@x-mars/tools'
import type { AgentSession } from '../session/agent-session'
import type { ContextDiagnostics, PluginCommandDiagnostic } from '../session/types'

export {
  applyPluginCommandArgumentDefaults,
  consumePluginConfirmationFlag,
  formatPluginCommandInvalidArguments,
  formatPluginCommandMissingArguments,
  formatPluginCommandUnexpectedArguments,
  getInvalidPluginCommandArguments,
  getMissingPluginCommandArguments,
  getUnexpectedPluginCommandArguments,
} from '@x-mars/tools'

export interface JsonModeResult {
  sessionId: string
  status: string
  messageCount: number
  response: string
}

export interface JsonStreamEvent {
  type: string
  sessionId: string
  timestamp: string
  data?: Record<string, unknown>
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
  permissionRegistry?: PermissionPolicyRegistry
  auditLog?: PermissionAuditLog
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

export async function runJsonStreamMode(
  session: AgentSession,
  prompt: string,
  writer: (event: JsonStreamEvent) => void = (event) =>
    process.stdout.write(`${JSON.stringify(event)}\n`),
): Promise<JsonModeResult> {
  const unsubscribe = session.subscribe((event) => {
    writer(serializeJsonStreamEvent(event))
  })

  try {
    const result = await runJsonMode(session, prompt)
    writer({
      type: 'result',
      sessionId: result.sessionId,
      timestamp: new Date().toISOString(),
      data: result as unknown as Record<string, unknown>,
    })
    return result
  } finally {
    unsubscribe()
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
  private readonly permissionRegistry?: PermissionPolicyRegistry
  private readonly auditLog?: PermissionAuditLog
  private readonly requirePluginConfirmation: boolean

  constructor(
    private readonly session: AgentSession,
    options: InteractiveModeOptions = {},
  ) {
    this.pluginAgentRegistry = options.pluginAgentRegistry
    this.pluginCommandRegistry = options.pluginCommandRegistry
    this.permissionRegistry = options.permissionRegistry
    this.auditLog = options.auditLog
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
      const invocationResult = buildPluginCommandInvocation(
        pluginCommand.command,
        confirmation.args,
        { confirmed: confirmation.confirmed },
      )
      if (!invocationResult.ok) {
        this.recordPluginCommandDiagnostic({
          kind: 'plugin-command',
          pluginId: pluginCommand.pluginId,
          commandName: pluginCommand.command.name,
          stage: 'parse',
          status: 'failed',
          confirmed: confirmation.confirmed,
          rawArgumentCount: confirmation.args.length,
          message: formatPluginCommandInvocationError(invocationResult.error),
        })
        return {
          type: 'system',
          text: formatPluginCommandInvocationError(invocationResult.error),
        }
      }
      this.recordPluginCommandDiagnostic(
        createPluginCommandDiagnostic(
          pluginCommand,
          invocationResult.invocation,
          'parse',
          'completed',
        ),
      )
      const permissionDenied = this.evaluatePluginCommandPermissions(
        pluginCommand,
        invocationResult.invocation,
      )
      if (permissionDenied) {
        return { type: 'system', text: permissionDenied }
      }
      if (pluginCommand.handler) {
        this.recordPluginCommandDiagnostic(
          createPluginCommandDiagnostic(
            pluginCommand,
            invocationResult.invocation,
            'handler',
            'started',
          ),
        )
        try {
          const handlerResult = await pluginCommand.handler(invocationResult.invocation, {
            pluginId: pluginCommand.pluginId,
            command: pluginCommand.command,
          })
          this.recordPluginCommandDiagnostic({
            ...createPluginCommandDiagnostic(
              pluginCommand,
              invocationResult.invocation,
              'handler',
              handlerResult.type === 'prompt' ? 'handoff' : 'completed',
            ),
            resultType: handlerResult.type,
          })
          if (handlerResult.type === 'system' || handlerResult.type === 'response') {
            return { type: handlerResult.type, text: handlerResult.text }
          }
          this.recordPluginCommandDiagnostic(
            createPluginCommandDiagnostic(
              pluginCommand,
              invocationResult.invocation,
              'prompt',
              'handoff',
            ),
          )
          const response = await runPrintMode(this.session, handlerResult.prompt, () => {})
          this.recordPluginCommandDiagnostic(
            createPluginCommandDiagnostic(
              pluginCommand,
              invocationResult.invocation,
              'prompt',
              'completed',
            ),
          )
          return { type: 'response', text: response }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.recordPluginCommandDiagnostic({
            ...createPluginCommandDiagnostic(
              pluginCommand,
              invocationResult.invocation,
              'handler',
              'failed',
            ),
            message,
          })
          return { type: 'system', text: `Plugin command "/${command}" handler failed: ${message}` }
        }
      }
      this.recordPluginCommandDiagnostic(
        createPluginCommandDiagnostic(
          pluginCommand,
          invocationResult.invocation,
          'prompt',
          'handoff',
        ),
      )
      const response = await runPrintMode(
        this.session,
        renderPluginCommandPrompt(pluginCommand.command, invocationResult.invocation.arguments),
        () => {},
      )
      this.recordPluginCommandDiagnostic(
        createPluginCommandDiagnostic(
          pluginCommand,
          invocationResult.invocation,
          'prompt',
          'completed',
        ),
      )
      return { type: 'response', text: response }
    }

    return { type: 'system', text: `Unknown command: /${command}` }
  }

  private evaluatePluginCommandPermissions(
    pluginCommand: PluginCommandRegistration,
    invocation: PluginCommandInvocation,
  ): string | undefined {
    const permissions = pluginCommand.command.permissions ?? []
    if (permissions.length === 0 || !this.permissionRegistry) {
      return undefined
    }

    for (const permission of permissions) {
      const context: PermissionContext = {
        timing: 'tool.execute.before',
        toolName: `plugin-command:${permission}`,
        args: invocation.typedArguments,
        agentName: 'plugin-command',
        sessionId: this.session.id,
        metadata: {
          kind: 'plugin-command',
          pluginId: pluginCommand.pluginId,
          commandName: pluginCommand.command.name,
          permission,
          confirmed: invocation.confirmed,
        },
      }
      const decision = this.permissionRegistry.evaluate(context)
      this.auditLog?.record(context, decision)
      this.recordPluginCommandDiagnostic({
        ...createPluginCommandDiagnostic(
          pluginCommand,
          invocation,
          'permission',
          decision.effect === 'allow'
            ? 'completed'
            : decision.effect === 'deny'
              ? 'denied'
              : 'requires_confirmation',
        ),
        permission,
        effect: decision.effect,
        reason: decision.reason ?? decision.ruleName,
      })
      const denied = formatPluginCommandPermissionDecision(
        pluginCommand.command,
        permission,
        decision,
      )
      if (denied) {
        return denied
      }
    }
    return undefined
  }

  private recordPluginCommandDiagnostic(diagnostic: PluginCommandDiagnostic): void {
    this.session.recordPluginCommandDiagnostic(diagnostic)
  }
}

function createPluginCommandDiagnostic(
  pluginCommand: PluginCommandRegistration,
  invocation: PluginCommandInvocation,
  stage: PluginCommandDiagnostic['stage'],
  status: PluginCommandDiagnostic['status'],
): PluginCommandDiagnostic {
  return {
    kind: 'plugin-command',
    pluginId: pluginCommand.pluginId,
    commandName: pluginCommand.command.name,
    stage,
    status,
    confirmed: invocation.confirmed,
    rawArgumentCount: invocation.rawArguments.length,
    argumentNames: Object.keys(invocation.namedArguments).sort(),
    typedArgumentKeys: Object.keys(invocation.typedArguments).sort(),
  }
}

export function formatPluginCommandPermissionDecision(
  command: PluginCommandManifest,
  permission: string,
  decision: PermissionDecision,
): string | undefined {
  if (decision.effect === 'deny') {
    return `Plugin command "/${command.name}" permission denied for ${permission}: ${decision.reason ?? decision.ruleName}`
  }
  if (decision.effect === 'ask') {
    return `Plugin command "/${command.name}" requires permission confirmation for ${permission}: ${decision.reason ?? decision.ruleName}`
  }
  return undefined
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

export function formatPluginConfirmationRequired(
  kind: 'agent' | 'command',
  pluginId: string,
  name: string,
): string {
  return `Plugin ${kind} requires confirmation: ${pluginId}/${name}. Re-run with ${PLUGIN_CONFIRM_FLAG} to execute.`
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

function serializeJsonStreamEvent(event: AgentSessionEvent): JsonStreamEvent {
  const base = {
    type: event.type,
    sessionId: event.sessionId,
    timestamp: new Date().toISOString(),
  }

  switch (event.type) {
    case 'prompt_start':
      return { ...base, data: { text: event.text } }
    case 'stream_event':
      return { ...base, data: { event: event.event } }
    case 'streaming_start':
      return { ...base, data: { model: event.model } }
    case 'streaming_end':
      return { ...base, data: { model: event.model, stopReason: event.stopReason } }
    case 'turn_start':
    case 'turn_end':
      return { ...base, data: { turnIndex: event.turnIndex } }
    case 'tool_call_start':
      return { ...base, data: { toolCall: event.toolCall } }
    case 'tool_call_end':
      return { ...base, data: { toolCall: event.toolCall, isError: event.isError } }
    case 'tool_execution_event':
      return { ...base, data: { event: event.event } }
    case 'error':
      return { ...base, data: { message: event.error.message } }
    default:
      return base
  }
}
