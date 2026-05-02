import type { PluginCommandManifest } from './plugin-manifest'

export const DEFAULT_PLUGIN_CONFIRM_FLAG = '--confirm-plugin'

export interface PluginCommandInvocation {
  commandName: string
  confirmed: boolean
  rawArguments: string[]
  positionalArguments: string[]
  arguments: string[]
}

export type PluginCommandInvocationError =
  | {
      code: 'missing_arguments'
      command: PluginCommandManifest
      missingArguments: string[]
    }
  | {
      code: 'unexpected_arguments'
      command: PluginCommandManifest
      unexpectedArguments: string[]
    }
  | {
      code: 'invalid_arguments'
      command: PluginCommandManifest
      invalidArguments: InvalidPluginCommandArgument[]
    }

export type PluginCommandInvocationResult =
  | { ok: true; invocation: PluginCommandInvocation }
  | { ok: false; error: PluginCommandInvocationError }

export interface BuildPluginCommandInvocationOptions {
  confirmed?: boolean
}

export function buildPluginCommandInvocation(
  command: PluginCommandManifest,
  args: readonly string[],
  options: BuildPluginCommandInvocationOptions = {},
): PluginCommandInvocationResult {
  const commandArgs = applyPluginCommandArgumentDefaults(command, args)
  const missingArguments = getMissingPluginCommandArguments(command, commandArgs)
  if (missingArguments.length > 0) {
    return { ok: false, error: { code: 'missing_arguments', command, missingArguments } }
  }

  const unexpectedArguments = getUnexpectedPluginCommandArguments(command, commandArgs)
  if (unexpectedArguments.length > 0) {
    return { ok: false, error: { code: 'unexpected_arguments', command, unexpectedArguments } }
  }

  const invalidArguments = getInvalidPluginCommandArguments(command, commandArgs)
  if (invalidArguments.length > 0) {
    return { ok: false, error: { code: 'invalid_arguments', command, invalidArguments } }
  }

  return {
    ok: true,
    invocation: {
      commandName: command.name,
      confirmed: options.confirmed ?? false,
      rawArguments: [...args],
      positionalArguments: [...args],
      arguments: commandArgs,
    },
  }
}

export function formatPluginCommandInvocationError(error: PluginCommandInvocationError): string {
  if (error.code === 'missing_arguments') {
    return formatPluginCommandMissingArguments(error.command, error.missingArguments)
  }
  if (error.code === 'unexpected_arguments') {
    return formatPluginCommandUnexpectedArguments(error.command, error.unexpectedArguments)
  }
  return formatPluginCommandInvalidArguments(error.command, error.invalidArguments)
}

export function consumePluginConfirmationFlag(
  args: readonly string[],
  flag = DEFAULT_PLUGIN_CONFIRM_FLAG,
): {
  confirmed: boolean
  args: string[]
} {
  const filtered = args.filter((arg) => arg !== flag)
  return { confirmed: filtered.length !== args.length, args: filtered }
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

export function formatPluginCommandUsage(command: PluginCommandManifest): string {
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
