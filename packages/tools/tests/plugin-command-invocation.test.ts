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
})
