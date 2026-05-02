import type { PluginCommandManifest } from './plugin-manifest'

export const DEFAULT_PLUGIN_CONFIRM_FLAG = '--confirm-plugin'

export type PluginCommandArgumentValue = string | number | boolean

export interface PluginCommandInvocation {
  commandName: string
  confirmed: boolean
  rawArguments: string[]
  positionalArguments: string[]
  namedArguments: Record<string, string>
  repeatedArguments: Record<string, string[]>
  typedArguments: Record<string, PluginCommandArgumentValue | PluginCommandArgumentValue[]>
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
  const parsed = parsePluginCommandArguments(command, args)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  const resolvedValues = applyPluginCommandArgumentDefaultsToValues(command, parsed.valuesByName)
  const commandArgs = command.arguments
    ? flattenPluginCommandArguments(command, resolvedValues)
    : parsed.arguments
  const missingArguments = getMissingPluginCommandArgumentValues(command, resolvedValues)
  if (missingArguments.length > 0) {
    return { ok: false, error: { code: 'missing_arguments', command, missingArguments } }
  }

  const unexpectedArguments = parsed.unexpectedArguments
  if (unexpectedArguments.length > 0) {
    return { ok: false, error: { code: 'unexpected_arguments', command, unexpectedArguments } }
  }

  const invalidArguments = getInvalidPluginCommandArgumentValues(command, resolvedValues)
  if (invalidArguments.length > 0) {
    return { ok: false, error: { code: 'invalid_arguments', command, invalidArguments } }
  }

  return {
    ok: true,
    invocation: {
      commandName: command.name,
      confirmed: options.confirmed ?? false,
      rawArguments: [...args],
      positionalArguments: parsed.positionalArguments,
      namedArguments: parsed.namedArguments,
      repeatedArguments: buildRepeatedArguments(command, resolvedValues),
      typedArguments: buildTypedArguments(command, resolvedValues),
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
      if (argument.flag) {
        const type = argument.type ? `:${argument.type}` : ''
        const defaultValue = argument.default !== undefined ? `=${argument.default}` : ''
        const repeatable = argument.repeatable ? '...' : ''
        const typedName = `--${argument.flag}${type}${defaultValue}${repeatable}`
        return argument.required ? `<${typedName}>` : `[${typedName}]`
      }
      const type = argument.type ? `:${argument.type}` : ''
      const defaultValue = argument.default !== undefined ? `=${argument.default}` : ''
      const repeatable = argument.repeatable ? '...' : ''
      const typedName = `${argument.name}${type}${defaultValue}${repeatable}`
      return argument.required ? `<${typedName}>` : `[${typedName}]`
    })
    .join(' ')}`
}

interface ParsedPluginCommandArguments {
  ok: true
  arguments: string[]
  positionalArguments: string[]
  namedArguments: Record<string, string>
  valuesByName: Record<string, string[]>
  unexpectedArguments: string[]
}

type ParsedPluginCommandArgumentsResult =
  | ParsedPluginCommandArguments
  | { ok: false; error: PluginCommandInvocationError }

function parsePluginCommandArguments(
  command: PluginCommandManifest,
  args: readonly string[],
): ParsedPluginCommandArgumentsResult {
  if (!command.arguments) {
    return {
      ok: true,
      arguments: [...args],
      positionalArguments: [...args],
      namedArguments: {},
      valuesByName: {},
      unexpectedArguments: [],
    }
  }

  const commandArguments = command.arguments ?? []
  const values: string[] = []
  const valuesByName: Record<string, string[]> = {}
  const positionalArguments: string[] = []
  const namedArguments: Record<string, string> = {}
  const unexpectedArguments: string[] = []
  const flagLookup = buildFlagLookup(command)
  let positionalIndex = 0

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? ''
    const flagToken = parseFlagToken(token)
    if (!flagToken) {
      const argumentIndex = findNextPositionalArgumentIndex(commandArguments, positionalIndex)
      if (argumentIndex === undefined) {
        unexpectedArguments.push(token)
        continue
      }
      const argument = commandArguments[argumentIndex]
      if (!argument) {
        unexpectedArguments.push(token)
        continue
      }
      values[argumentIndex] = token
      pushArgumentValue(valuesByName, argument.name, token)
      positionalArguments.push(token)
      positionalIndex = argument.repeatable ? argumentIndex : argumentIndex + 1
      continue
    }

    const matched = flagLookup.get(flagToken.name)
    if (!matched) {
      if (flagLookup.size > 0) {
        return {
          ok: false,
          error: { code: 'unexpected_arguments', command, unexpectedArguments: [token] },
        }
      }
      const argumentIndex = findNextPositionalArgumentIndex(commandArguments, positionalIndex)
      if (argumentIndex === undefined) {
        unexpectedArguments.push(token)
        continue
      }
      const argument = commandArguments[argumentIndex]
      if (!argument) {
        unexpectedArguments.push(token)
        continue
      }
      values[argumentIndex] = token
      pushArgumentValue(valuesByName, argument.name, token)
      positionalArguments.push(token)
      positionalIndex = argument.repeatable ? argumentIndex : argumentIndex + 1
      continue
    }

    let value = flagToken.value
    if (value === undefined) {
      if (matched.argument.type === 'boolean') {
        value = 'true'
      } else {
        const next = args[index + 1]
        if (next === undefined || parseFlagToken(next)) {
          return {
            ok: false,
            error: {
              code: 'missing_arguments',
              command,
              missingArguments: [matched.argument.name],
            },
          }
        }
        value = next
        index += 1
      }
    }

    if (matched.argument.repeatable) {
      pushArgumentValue(valuesByName, matched.argument.name, value)
    } else {
      valuesByName[matched.argument.name] = [value]
    }
    values[matched.index] = value
    namedArguments[matched.argument.name] = value
  }

  return {
    ok: true,
    arguments: values,
    positionalArguments,
    namedArguments,
    valuesByName,
    unexpectedArguments,
  }
}

function applyPluginCommandArgumentDefaultsToValues(
  command: PluginCommandManifest,
  valuesByName: Record<string, string[]>,
): Record<string, string[]> {
  const resolved: Record<string, string[]> = {}
  for (const [name, values] of Object.entries(valuesByName)) {
    resolved[name] = [...values]
  }
  for (const argument of command.arguments ?? []) {
    if (!resolved[argument.name]?.length && argument.default !== undefined) {
      resolved[argument.name] = [argument.default]
    }
  }
  return resolved
}

function flattenPluginCommandArguments(
  command: PluginCommandManifest,
  valuesByName: Record<string, string[]>,
): string[] {
  if (!command.arguments) {
    return Object.values(valuesByName).flat()
  }
  return command.arguments.flatMap((argument) => valuesByName[argument.name] ?? [])
}

function getMissingPluginCommandArgumentValues(
  command: PluginCommandManifest,
  valuesByName: Record<string, string[]>,
): string[] {
  return (command.arguments ?? [])
    .filter((argument) => argument.required && !((valuesByName[argument.name]?.length ?? 0) > 0))
    .map((argument) => argument.name)
}

function getInvalidPluginCommandArgumentValues(
  command: PluginCommandManifest,
  valuesByName: Record<string, string[]>,
): InvalidPluginCommandArgument[] {
  const invalid: InvalidPluginCommandArgument[] = []
  for (const argument of command.arguments ?? []) {
    for (const value of valuesByName[argument.name] ?? []) {
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
  }
  return invalid
}

function buildRepeatedArguments(
  command: PluginCommandManifest,
  valuesByName: Record<string, string[]>,
): Record<string, string[]> {
  const repeated: Record<string, string[]> = {}
  for (const argument of command.arguments ?? []) {
    if (argument.repeatable) {
      repeated[argument.name] = [...(valuesByName[argument.name] ?? [])]
    }
  }
  return repeated
}

function buildTypedArguments(
  command: PluginCommandManifest,
  valuesByName: Record<string, string[]>,
): Record<string, PluginCommandArgumentValue | PluginCommandArgumentValue[]> {
  const typed: Record<string, PluginCommandArgumentValue | PluginCommandArgumentValue[]> = {}
  for (const argument of command.arguments ?? []) {
    const values = valuesByName[argument.name]
    if (!values || values.length === 0) {
      continue
    }
    const coerced = values.map((value) => coercePluginCommandArgumentValue(value, argument.type))
    const lastValue = coerced[coerced.length - 1]
    if (lastValue === undefined) {
      continue
    }
    typed[argument.name] = argument.repeatable ? coerced : lastValue
  }
  return typed
}

function coercePluginCommandArgumentValue(
  value: string,
  type: NonNullable<PluginCommandManifest['arguments']>[number]['type'],
): PluginCommandArgumentValue {
  if (type === 'number') {
    return Number(value)
  }
  if (type === 'boolean') {
    return value === 'true'
  }
  return value
}

function pushArgumentValue(
  valuesByName: Record<string, string[]>,
  name: string,
  value: string,
): void {
  valuesByName[name] = [...(valuesByName[name] ?? []), value]
}

function buildFlagLookup(
  command: PluginCommandManifest,
): Map<
  string,
  { argument: NonNullable<PluginCommandManifest['arguments']>[number]; index: number }
> {
  const lookup = new Map<
    string,
    { argument: NonNullable<PluginCommandManifest['arguments']>[number]; index: number }
  >()
  for (const [index, argument] of (command.arguments ?? []).entries()) {
    if (argument.flag) {
      lookup.set(argument.flag, { argument, index })
    }
    if (argument.alias) {
      lookup.set(argument.alias, { argument, index })
    }
  }
  return lookup
}

function parseFlagToken(token: string): { name: string; value?: string } | undefined {
  if (!token.startsWith('--') || token.length <= 2) {
    return undefined
  }
  const body = token.slice(2)
  const equalsIndex = body.indexOf('=')
  if (equalsIndex >= 0) {
    return { name: body.slice(0, equalsIndex), value: body.slice(equalsIndex + 1) }
  }
  return { name: body }
}

function findNextPositionalArgumentIndex(
  commandArguments: readonly NonNullable<PluginCommandManifest['arguments']>[number][],
  start: number,
): number | undefined {
  for (let index = start; index < commandArguments.length; index += 1) {
    const argument = commandArguments[index]
    if (!argument?.flag) {
      return index
    }
  }
  return undefined
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
