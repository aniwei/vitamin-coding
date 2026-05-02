import { describe, expect, it } from 'vitest'
import {
  buildPluginCommandInvocation,
  consumePluginConfirmationFlag,
  formatPluginCommandInvocationError,
} from '../src/plugin-command-invocation'

describe('plugin command invocation', () => {
  it('#then builds a reusable invocation with defaults and confirmation metadata', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'deploy',
        arguments: [
          { name: 'environment', choices: ['staging', 'production'], default: 'staging' },
          { name: 'dryRun', type: 'boolean', default: 'false' },
        ],
      },
      [],
      { confirmed: true },
    )

    expect(result).toEqual({
      ok: true,
      invocation: {
        commandName: 'deploy',
        confirmed: true,
        rawArguments: [],
        positionalArguments: [],
        namedArguments: {},
        repeatedArguments: {},
        typedArguments: { environment: 'staging', dryRun: false },
        arguments: ['staging', 'false'],
      },
    })
  })

  it('#then returns structured errors before prompt or module execution', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'review',
        arguments: [{ name: 'path', required: true }],
      },
      [],
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'missing_arguments',
        command: {
          name: 'review',
          arguments: [{ name: 'path', required: true }],
        },
        missingArguments: ['path'],
      },
    })
    if (!result.ok) {
      expect(formatPluginCommandInvocationError(result.error)).toBe(
        'Plugin command "/review" requires arguments: path. Usage: /review <path>',
      )
    }
  })

  it('#then preserves freeform commands while rejecting overflow for schema commands', () => {
    expect(buildPluginCommandInvocation({ name: 'freeform' }, ['anything', 'goes'])).toEqual({
      ok: true,
      invocation: {
        commandName: 'freeform',
        confirmed: false,
        rawArguments: ['anything', 'goes'],
        positionalArguments: ['anything', 'goes'],
        namedArguments: {},
        repeatedArguments: {},
        typedArguments: {},
        arguments: ['anything', 'goes'],
      },
    })

    const result = buildPluginCommandInvocation(
      {
        name: 'deploy',
        arguments: [{ name: 'environment', required: true }],
      },
      ['staging', 'now'],
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unexpected_arguments',
        command: {
          name: 'deploy',
          arguments: [{ name: 'environment', required: true }],
        },
        unexpectedArguments: ['now'],
      },
    })
  })

  it('#then keeps host confirmation flags outside plugin positional arguments', () => {
    expect(consumePluginConfirmationFlag(['--confirm-plugin', 'src/app.ts'])).toEqual({
      confirmed: true,
      args: ['src/app.ts'],
    })
  })

  it('#then parses declared command flags before validation', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'deploy',
        arguments: [
          { name: 'environment', required: true, flag: 'env', alias: 'environment' },
          { name: 'dryRun', type: 'boolean', flag: 'dry-run' },
          { name: 'path', required: true },
        ],
      },
      ['--env=staging', '--dry-run', 'src/app.ts'],
    )

    expect(result).toEqual({
      ok: true,
      invocation: {
        commandName: 'deploy',
        confirmed: false,
        rawArguments: ['--env=staging', '--dry-run', 'src/app.ts'],
        positionalArguments: ['src/app.ts'],
        namedArguments: { environment: 'staging', dryRun: 'true' },
        repeatedArguments: {},
        typedArguments: { environment: 'staging', dryRun: true, path: 'src/app.ts' },
        arguments: ['staging', 'true', 'src/app.ts'],
      },
    })
  })

  it('#then rejects unknown flags when a command declares flags', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'deploy',
        arguments: [{ name: 'environment', flag: 'env' }],
      },
      ['--unknown', 'staging'],
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'unexpected_arguments',
        command: {
          name: 'deploy',
          arguments: [{ name: 'environment', flag: 'env' }],
        },
        unexpectedArguments: ['--unknown'],
      },
    })
  })

  it('#then requires values for non-boolean flags', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'deploy',
        arguments: [{ name: 'environment', required: true, flag: 'env' }],
      },
      ['--env'],
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'missing_arguments',
        command: {
          name: 'deploy',
          arguments: [{ name: 'environment', required: true, flag: 'env' }],
        },
        missingArguments: ['environment'],
      },
    })
  })

  it('#then collects repeatable flag values as arrays', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'review',
        arguments: [
          { name: 'file', required: true, flag: 'file', repeatable: true },
          { name: 'mode', choices: ['quick', 'deep'], default: 'quick' },
        ],
      },
      ['--file', 'src/app.ts', '--file=src/index.ts'],
    )

    expect(result).toEqual({
      ok: true,
      invocation: {
        commandName: 'review',
        confirmed: false,
        rawArguments: ['--file', 'src/app.ts', '--file=src/index.ts'],
        positionalArguments: [],
        namedArguments: { file: 'src/index.ts' },
        repeatedArguments: { file: ['src/app.ts', 'src/index.ts'] },
        typedArguments: { file: ['src/app.ts', 'src/index.ts'], mode: 'quick' },
        arguments: ['src/app.ts', 'src/index.ts', 'quick'],
      },
    })
  })

  it('#then collects repeatable positional tail values as arrays', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'tag',
        arguments: [
          { name: 'mode', required: true },
          { name: 'tag', required: true, repeatable: true, choices: ['safe', 'fast'] },
        ],
      },
      ['apply', 'safe', 'fast'],
    )

    expect(result).toEqual({
      ok: true,
      invocation: {
        commandName: 'tag',
        confirmed: false,
        rawArguments: ['apply', 'safe', 'fast'],
        positionalArguments: ['apply', 'safe', 'fast'],
        namedArguments: {},
        repeatedArguments: { tag: ['safe', 'fast'] },
        typedArguments: { mode: 'apply', tag: ['safe', 'fast'] },
        arguments: ['apply', 'safe', 'fast'],
      },
    })
  })

  it('#then exposes typed values for module command runtimes without changing display arguments', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'batch',
        arguments: [
          { name: 'count', required: true, type: 'number' },
          { name: 'dryRun', type: 'boolean', default: 'false', flag: 'dry-run' },
          { name: 'ratio', type: 'number', repeatable: true, flag: 'ratio' },
        ],
      },
      ['3', '--dry-run=true', '--ratio=1.5', '--ratio', '2'],
    )

    expect(result).toEqual({
      ok: true,
      invocation: {
        commandName: 'batch',
        confirmed: false,
        rawArguments: ['3', '--dry-run=true', '--ratio=1.5', '--ratio', '2'],
        positionalArguments: ['3'],
        namedArguments: { dryRun: 'true', ratio: '2' },
        repeatedArguments: { ratio: ['1.5', '2'] },
        typedArguments: { count: 3, dryRun: true, ratio: [1.5, 2] },
        arguments: ['3', 'true', '1.5', '2'],
      },
    })
  })

  it('#then validates every repeatable value', () => {
    const result = buildPluginCommandInvocation(
      {
        name: 'tag',
        arguments: [{ name: 'tag', required: true, repeatable: true, choices: ['safe', 'fast'] }],
      },
      ['safe', 'unsafe'],
    )

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_arguments',
        command: {
          name: 'tag',
          arguments: [{ name: 'tag', required: true, repeatable: true, choices: ['safe', 'fast'] }],
        },
        invalidArguments: [{ name: 'tag', expectedType: 'one of safe, fast', value: 'unsafe' }],
      },
    })
  })
})
