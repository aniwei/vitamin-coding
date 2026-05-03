import { describe, expect, it } from 'vitest'
import { Agent, type AgentMessage } from '@x-mars/agent'
import {
  createEventStream,
  type AssistantMessage,
  type Model,
  type StreamContext,
  type StreamEvent,
} from '@x-mars/ai'
import { PermissionAuditLog, PermissionPolicyRegistry, createHookRegistry } from '@x-mars/hooks'
import { createInMemorySessionStore } from '@x-mars/session'
import { createPluginAgentRegistry, createPluginCommandRegistry } from '@x-mars/tools'

import { AgentSession } from '../src/session/agent-session'
import {
  InteractiveMode,
  applyPluginCommandArgumentDefaults,
  consumePluginConfirmationFlag,
  formatPluginConfirmationRequired,
  formatPluginCommandInvalidArguments,
  formatPluginCommandMissingArguments,
  formatPluginCommandUnexpectedArguments,
  getInvalidPluginCommandArguments,
  getMissingPluginCommandArguments,
  getUnexpectedPluginCommandArguments,
  getLastAssistantText,
  parseInteractiveSlashInput,
  renderPluginAgentPrompt,
  renderPluginCommandPrompt,
  runJsonMode,
  runPrintMode,
  runRpcMode,
} from '../src/modes/run-modes'

function makeModel(): Model {
  return {
    id: 'openai/test-model',
    name: 'test-model',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'openai',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: 'end_turn',
    model: 'openai/test-model',
  }
}

function makeEchoStream() {
  return (context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    const userText = context.messages
      .filter((m) => typeof m === 'object' && m !== null && 'role' in m && m.role === 'user')
      .flatMap((m) => ('content' in m && Array.isArray(m.content) ? m.content : []))
      .filter(
        (part) =>
          typeof part === 'object' && part !== null && 'type' in part && part.type === 'text',
      )
      .map((part) => ('text' in part ? String(part.text) : ''))
      .join(' ')
      .trim()

    const response = makeAssistantMessage(`echo:${userText}`)

    setTimeout(() => {
      eventStream.push({ type: 'start', partial: response })
      eventStream.push({ type: 'done', reason: 'end_turn', message: response })
      eventStream.complete(response)
    }, 0)

    return eventStream
  }
}

async function createSession(id: string): Promise<AgentSession> {
  const hooks = createHookRegistry({ preset: 'none' })
  const store = createInMemorySessionStore<AgentMessage>()
  const sessionData = await store.createSession(id)
  const agent = new Agent({ stream: makeEchoStream() })

  return new AgentSession(sessionData, agent, {
    model: makeModel(),
    systemPrompt: 'system',
    hooks,
  })
}

describe('run modes', () => {
  it('runPrintMode writes and returns the final assistant text', async () => {
    const session = await createSession('print-mode')
    const output: string[] = []

    const text = await runPrintMode(session, 'hello print', (line) => output.push(line))

    expect(text).toContain('echo:hello print')
    expect(output).toEqual([text])
  })

  it('runJsonMode returns normalized session result', async () => {
    const session = await createSession('json-mode')

    const result = await runJsonMode(session, 'hello json')

    expect(result.sessionId).toBe('json-mode')
    expect(result.status).toBeTypeOf('string')
    expect(result.messageCount).toBeGreaterThanOrEqual(2)
    expect(result.response).toContain('echo:hello json')
  })

  it('runRpcMode handles prompt and status methods', async () => {
    const session = await createSession('rpc-mode')

    const promptResult = await runRpcMode(session, {
      id: '1',
      method: 'prompt',
      params: { text: 'hello rpc' },
    })

    expect(promptResult.ok).toBe(true)
    if (promptResult.ok) {
      expect(promptResult.result).toMatchObject({
        sessionId: 'rpc-mode',
      })
    }

    const statusResult = await runRpcMode(session, { id: '2', method: 'status' })
    expect(statusResult).toMatchObject({
      id: '2',
      ok: true,
    })
  })

  it('InteractiveMode handles slash commands and prompt text', async () => {
    const session = await createSession('interactive-mode')
    const mode = new InteractiveMode(session)

    const help = await mode.handleInput('/help')
    expect(help).toMatchObject({ type: 'system' })

    const response = await mode.handleInput('hello interactive')
    expect(response).toMatchObject({ type: 'response' })
    if (response.type === 'response') {
      expect(response.text).toContain('echo:hello interactive')
    }

    const exit = await mode.handleInput('/exit')
    expect(exit).toEqual({ type: 'exit' })
  })

  it('InteractiveMode routes plugin slash commands through the current session', async () => {
    const session = await createSession('interactive-plugin-command')
    const registry = createPluginCommandRegistry()
    registry.register({ name: 'review', description: 'Review the selected file.' }, 'review-plugin')
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const help = await mode.handleInput('/help')
    expect(help.type).toBe('system')
    if (help.type === 'system') {
      expect(help.text).toContain('Plugin commands: /review')
    }

    const response = await mode.handleInput('/review src/app.ts')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Run plugin command "/review".')
      expect(response.text).toContain('Review the selected file.')
      expect(response.text).toContain('Arguments: src/app.ts')
    }
  })

  it('InteractiveMode requires confirmation for plugin slash commands when enabled', async () => {
    const session = await createSession('interactive-plugin-command-confirm')
    const registry = createPluginCommandRegistry()
    registry.register({ name: 'review', description: 'Review the selected file.' }, 'review-plugin')
    const mode = new InteractiveMode(session, {
      pluginCommandRegistry: registry,
      requirePluginConfirmation: true,
    })

    const rejected = await mode.handleInput('/review src/app.ts')
    expect(rejected).toEqual({
      type: 'system',
      text: 'Plugin command requires confirmation: review-plugin/review. Re-run with --confirm-plugin to execute.',
    })

    const response = await mode.handleInput('/review --confirm-plugin src/app.ts')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: src/app.ts')
      expect(response.text).not.toContain('--confirm-plugin')
    }
  })

  it('InteractiveMode rejects plugin slash commands with missing required arguments', async () => {
    const session = await createSession('interactive-plugin-command-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'review',
        description: 'Review the selected file.',
        arguments: [{ name: 'path', description: 'Target path', required: true }],
      },
      'review-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const rejected = await mode.handleInput('/review')
    expect(rejected).toEqual({
      type: 'system',
      text: 'Plugin command "/review" requires arguments: path. Usage: /review <path>',
    })

    const response = await mode.handleInput('/review src/app.ts')
    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: src/app.ts')
      expect(response.text).toContain('Argument schema:')
      expect(response.text).toContain('- path (required, string): Target path')
    }
  })

  it('InteractiveMode rejects plugin slash commands with invalid typed arguments', async () => {
    const session = await createSession('interactive-plugin-command-typed-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'batch',
        description: 'Run a typed batch.',
        arguments: [
          { name: 'count', required: true, type: 'number' },
          { name: 'dryRun', required: false, type: 'boolean' },
        ],
      },
      'batch-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const rejected = await mode.handleInput('/batch many maybe')
    expect(rejected).toEqual({
      type: 'system',
      text: 'Plugin command "/batch" has invalid arguments: count expected number, got "many"; dryRun expected boolean, got "maybe". Usage: /batch <count:number> [dryRun:boolean]',
    })

    const response = await mode.handleInput('/batch 3 false')
    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: 3 false')
      expect(response.text).toContain('- count (required, number)')
      expect(response.text).toContain('- dryRun (optional, boolean)')
    }
  })

  it('InteractiveMode rejects plugin slash commands outside declared choices', async () => {
    const session = await createSession('interactive-plugin-command-choice-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'deploy',
        description: 'Deploy to an environment.',
        arguments: [
          {
            name: 'environment',
            required: true,
            type: 'string',
            choices: ['staging', 'production'],
          },
        ],
      },
      'deploy-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const rejected = await mode.handleInput('/deploy preview')
    expect(rejected).toEqual({
      type: 'system',
      text: 'Plugin command "/deploy" has invalid arguments: environment expected one of staging, production, got "preview". Usage: /deploy <environment:string>',
    })

    const response = await mode.handleInput('/deploy staging')
    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: staging')
      expect(response.text).toContain(
        '- environment (required, string, choices: staging, production)',
      )
    }
  })

  it('InteractiveMode applies plugin slash command argument defaults before execution', async () => {
    const session = await createSession('interactive-plugin-command-default-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'deploy',
        description: 'Deploy with a default environment.',
        arguments: [
          {
            name: 'environment',
            required: false,
            type: 'string',
            choices: ['staging', 'production'],
            default: 'staging',
          },
        ],
      },
      'deploy-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const response = await mode.handleInput('/deploy')
    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: staging')
      expect(response.text).toContain(
        '- environment (optional, string, choices: staging, production, default: staging)',
      )
    }
  })

  it('InteractiveMode rejects extra plugin slash command arguments when schema is declared', async () => {
    const session = await createSession('interactive-plugin-command-extra-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'deploy',
        description: 'Deploy to an environment.',
        arguments: [{ name: 'environment', required: true, choices: ['staging', 'production'] }],
      },
      'deploy-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const rejected = await mode.handleInput('/deploy staging now')
    expect(rejected).toEqual({
      type: 'system',
      text: 'Plugin command "/deploy" received unexpected arguments: now. Usage: /deploy <environment>',
    })

    const response = await mode.handleInput('/deploy production')
    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: production')
    }
  })

  it('InteractiveMode parses quoted plugin slash command arguments before validation', async () => {
    const session = await createSession('interactive-plugin-command-quoted-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'review',
        description: 'Review a path with spaces.',
        arguments: [{ name: 'path', required: true }],
      },
      'review-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const response = await mode.handleInput('/review "src/app shell.ts"')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: src/app shell.ts')
      expect(response.text).not.toContain('unexpected arguments')
    }
  })

  it('InteractiveMode accepts declared plugin slash command flags', async () => {
    const session = await createSession('interactive-plugin-command-flag-args')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'review',
        description: 'Review a target path.',
        arguments: [
          { name: 'path', required: true, flag: 'path' },
          { name: 'dryRun', type: 'boolean', flag: 'dry-run' },
        ],
      },
      'review-plugin',
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const response = await mode.handleInput('/review --path "src/app shell.ts" --dry-run')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Arguments: src/app shell.ts true')
      expect(response.text).toContain('- path (required, string)')
      expect(response.text).toContain('- dryRun (optional, boolean)')
      expect(response.text).not.toContain('unexpected arguments')
    }
  })

  it('InteractiveMode executes plugin command handlers with typed invocation input', async () => {
    const session = await createSession('interactive-plugin-command-handler')
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'batch',
        description: 'Run a batch.',
        arguments: [
          { name: 'count', required: true, type: 'number' },
          { name: 'dryRun', type: 'boolean', flag: 'dry-run' },
        ],
      },
      'batch-plugin',
      async (invocation, context) => ({
        type: 'response',
        text: `${context.pluginId}:${invocation.typedArguments.count}:${invocation.typedArguments.dryRun}`,
      }),
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const response = await mode.handleInput('/batch 3 --dry-run')

    expect(response).toEqual({
      type: 'response',
      text: 'batch-plugin:3:true',
    })
  })

  it('InteractiveMode lets plugin command handlers hand off prompts to the current session', async () => {
    const session = await createSession('interactive-plugin-command-handler-prompt')
    const registry = createPluginCommandRegistry()
    registry.register({ name: 'review' }, 'review-plugin', async () => ({
      type: 'prompt',
      prompt: 'handler prompt',
    }))
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    const response = await mode.handleInput('/review src/app.ts')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('echo:handler prompt')
    }
  })

  it('InteractiveMode denies plugin command permissions before handler or prompt execution', async () => {
    const session = await createSession('interactive-plugin-command-permission-deny')
    const registry = createPluginCommandRegistry()
    let called = false
    registry.register({ name: 'deploy', permissions: ['shell'] }, 'deploy-plugin', async () => {
      called = true
      return { type: 'response', text: 'must not run' }
    })
    const permissionRegistry = new PermissionPolicyRegistry()
    permissionRegistry.register({
      name: 'deny-plugin-shell',
      priority: 1,
      enabled: true,
      scope: {},
      rules: [
        {
          name: 'deny-plugin-shell',
          effect: 'deny',
          match: { tools: ['plugin-command:shell'] },
          denyReason: 'shell command permission denied',
        },
      ],
    })
    const auditLog = new PermissionAuditLog()
    const mode = new InteractiveMode(session, {
      pluginCommandRegistry: registry,
      permissionRegistry,
      auditLog,
    })

    const response = await mode.handleInput('/deploy')

    expect(response).toEqual({
      type: 'system',
      text: 'Plugin command "/deploy" permission denied for shell: shell command permission denied',
    })
    expect(called).toBe(false)
    expect(auditLog.getEntries()).toMatchObject([
      {
        sessionId: 'interactive-plugin-command-permission-deny',
        toolName: 'plugin-command:shell',
        metadata: {
          kind: 'plugin-command',
          pluginId: 'deploy-plugin',
          commandName: 'deploy',
          permission: 'shell',
        },
        decision: { effect: 'deny' },
      },
    ])
  })

  it('InteractiveMode records allow audits for declared plugin command permissions', async () => {
    const session = await createSession('interactive-plugin-command-permission-allow')
    const registry = createPluginCommandRegistry()
    registry.register({ name: 'deploy', permissions: ['network'] }, 'deploy-plugin', async () => ({
      type: 'response',
      text: 'handled',
    }))
    const permissionRegistry = new PermissionPolicyRegistry()
    permissionRegistry.register({
      name: 'allow-plugin-network',
      priority: 1,
      enabled: true,
      scope: {},
      rules: [
        {
          name: 'allow-plugin-network',
          effect: 'allow',
          match: { tools: ['plugin-command:network'] },
        },
      ],
    })
    const auditLog = new PermissionAuditLog()
    const mode = new InteractiveMode(session, {
      pluginCommandRegistry: registry,
      permissionRegistry,
      auditLog,
    })

    const response = await mode.handleInput('/deploy')

    expect(response).toEqual({ type: 'response', text: 'handled' })
    expect(auditLog.getEntries()[0]).toMatchObject({
      toolName: 'plugin-command:network',
      decision: { effect: 'allow' },
    })
  })

  it('InteractiveMode emits redacted plugin command diagnostics for parse and handler stages', async () => {
    const session = await createSession('interactive-plugin-command-diagnostics')
    const diagnostics: unknown[] = []
    session.subscribe((event) => {
      if (event.type === 'plugin_command_diagnostic') {
        diagnostics.push(event.diagnostic)
      }
    })
    const registry = createPluginCommandRegistry()
    registry.register(
      {
        name: 'deploy',
        prompt: 'Deploy secret $ARGUMENTS',
        arguments: [{ name: 'target', required: true }],
      },
      'deploy-plugin',
      async () => {
        throw new Error('handler exploded')
      },
    )
    const mode = new InteractiveMode(session, { pluginCommandRegistry: registry })

    await mode.handleInput('/deploy')
    await mode.handleInput('/deploy production')

    expect(diagnostics).toMatchObject([
      {
        kind: 'plugin-command',
        pluginId: 'deploy-plugin',
        commandName: 'deploy',
        stage: 'parse',
        status: 'failed',
        rawArgumentCount: 0,
      },
      {
        stage: 'parse',
        status: 'completed',
        typedArgumentKeys: ['target'],
      },
      {
        stage: 'handler',
        status: 'started',
      },
      {
        stage: 'handler',
        status: 'failed',
        message: 'handler exploded',
      },
    ])
    expect(JSON.stringify(diagnostics)).not.toContain('Deploy secret')
  })

  it('InteractiveMode routes plugin agents through the current session', async () => {
    const session = await createSession('interactive-plugin-agent')
    const registry = createPluginAgentRegistry()
    registry.register(
      {
        name: 'reviewer',
        description: 'Review code.',
        prompt: 'Focus on correctness.',
        tools: ['read', 'grep'],
      },
      'review-plugin',
    )
    const mode = new InteractiveMode(session, { pluginAgentRegistry: registry })

    const help = await mode.handleInput('/help')
    expect(help.type).toBe('system')
    if (help.type === 'system') {
      expect(help.text).toContain('Plugin agents: reviewer')
    }

    const response = await mode.handleInput('/agent reviewer src/app.ts')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Run plugin agent "reviewer".')
      expect(response.text).toContain('Review code.')
      expect(response.text).toContain('Preferred tools: read, grep')
      expect(response.text).toContain('Focus on correctness.')
      expect(response.text).toContain('Task: src/app.ts')
    }
  })

  it('InteractiveMode requires confirmation for plugin agents when enabled', async () => {
    const session = await createSession('interactive-plugin-agent-confirm')
    const registry = createPluginAgentRegistry()
    registry.register({ name: 'reviewer', description: 'Review code.' }, 'review-plugin')
    const mode = new InteractiveMode(session, {
      pluginAgentRegistry: registry,
      requirePluginConfirmation: true,
    })

    const rejected = await mode.handleInput('/agent reviewer src/app.ts')
    expect(rejected).toEqual({
      type: 'system',
      text: 'Plugin agent requires confirmation: review-plugin/reviewer. Re-run with --confirm-plugin to execute.',
    })

    const response = await mode.handleInput('/agent reviewer --confirm-plugin src/app.ts')

    expect(response.type).toBe('response')
    if (response.type === 'response') {
      expect(response.text).toContain('Task: src/app.ts')
      expect(response.text).not.toContain('--confirm-plugin')
    }
  })

  it('InteractiveMode parses quoted compact summaries', async () => {
    const session = await createSession('interactive-compact-quoted')
    const mode = new InteractiveMode(session)

    await mode.handleInput('hello before compact')
    const response = await mode.handleInput('/compact 1 "quoted summary"')

    expect(response).toEqual({ type: 'system', text: 'Compaction complete.' })
    expect(session.session.buildContext().summary).toBe('quoted summary')
  })

  it('consumePluginConfirmationFlag removes only confirmation tokens', () => {
    expect(consumePluginConfirmationFlag(['--confirm-plugin', 'src/app.ts'])).toEqual({
      confirmed: true,
      args: ['src/app.ts'],
    })
    expect(consumePluginConfirmationFlag(['src/app.ts'])).toEqual({
      confirmed: false,
      args: ['src/app.ts'],
    })
  })

  it('formatPluginConfirmationRequired explains how to confirm plugin execution', () => {
    expect(formatPluginConfirmationRequired('command', 'review-plugin', 'review')).toBe(
      'Plugin command requires confirmation: review-plugin/review. Re-run with --confirm-plugin to execute.',
    )
  })

  it('parseInteractiveSlashInput supports quotes and escaped whitespace', () => {
    expect(parseInteractiveSlashInput('/review "src/app shell.ts" focus\\ mode')).toEqual([
      'review',
      'src/app shell.ts',
      'focus mode',
    ])
    expect(parseInteractiveSlashInput("/review 'single quoted' plain")).toEqual([
      'review',
      'single quoted',
      'plain',
    ])
    expect(parseInteractiveSlashInput('/review --confirm-plugin "src/app.ts"')).toEqual([
      'review',
      '--confirm-plugin',
      'src/app.ts',
    ])
  })

  it('getMissingPluginCommandArguments reports missing required positional args', () => {
    expect(
      getMissingPluginCommandArguments(
        {
          name: 'review',
          arguments: [
            { name: 'path', required: true },
            { name: 'focus', required: false },
            { name: 'mode', required: true },
          ],
        },
        ['src/app.ts'],
      ),
    ).toEqual(['mode'])
  })

  it('formatPluginCommandMissingArguments includes usage from command schema', () => {
    expect(
      formatPluginCommandMissingArguments(
        {
          name: 'review',
          arguments: [
            { name: 'path', required: true },
            { name: 'focus', required: false },
          ],
        },
        ['path'],
      ),
    ).toBe('Plugin command "/review" requires arguments: path. Usage: /review <path> [focus]')
  })

  it('getUnexpectedPluginCommandArguments reports overflow only when schema exists', () => {
    expect(
      getUnexpectedPluginCommandArguments(
        {
          name: 'deploy',
          arguments: [{ name: 'environment', required: true }],
        },
        ['staging', 'now'],
      ),
    ).toEqual(['now'])
    expect(getUnexpectedPluginCommandArguments({ name: 'freeform' }, ['anything'])).toEqual([])
  })

  it('formatPluginCommandUnexpectedArguments includes usage from command schema', () => {
    expect(
      formatPluginCommandUnexpectedArguments(
        {
          name: 'deploy',
          arguments: [{ name: 'environment', required: true }],
        },
        ['now'],
      ),
    ).toBe(
      'Plugin command "/deploy" received unexpected arguments: now. Usage: /deploy <environment>',
    )
  })

  it('applyPluginCommandArgumentDefaults fills missing positional values only', () => {
    expect(
      applyPluginCommandArgumentDefaults(
        {
          name: 'deploy',
          arguments: [
            { name: 'environment', default: 'staging' },
            { name: 'force', type: 'boolean', default: 'false' },
          ],
        },
        ['production'],
      ),
    ).toEqual(['production', 'false'])
  })

  it('getInvalidPluginCommandArguments reports typed positional arg failures', () => {
    expect(
      getInvalidPluginCommandArguments(
        {
          name: 'batch',
          arguments: [
            { name: 'count', required: true, type: 'number' },
            { name: 'dryRun', required: false, type: 'boolean' },
            { name: 'label', required: false, type: 'string', choices: ['safe', 'fast'] },
          ],
        },
        ['NaNish', 'yes', 'unsafe'],
      ),
    ).toEqual([
      { name: 'count', expectedType: 'number', value: 'NaNish' },
      { name: 'dryRun', expectedType: 'boolean', value: 'yes' },
      { name: 'label', expectedType: 'one of safe, fast', value: 'unsafe' },
    ])
  })

  it('formatPluginCommandInvalidArguments includes typed usage', () => {
    expect(
      formatPluginCommandInvalidArguments(
        {
          name: 'batch',
          arguments: [
            { name: 'count', required: true, type: 'number' },
            { name: 'dryRun', required: false, type: 'boolean' },
          ],
        },
        [{ name: 'count', expectedType: 'number', value: 'many' }],
      ),
    ).toBe(
      'Plugin command "/batch" has invalid arguments: count expected number, got "many". Usage: /batch <count:number> [dryRun:boolean]',
    )
  })

  it('renderPluginCommandPrompt includes description and arguments conservatively', () => {
    expect(
      renderPluginCommandPrompt({ name: 'review', description: 'Review changed files.' }, [
        '--staged',
      ]),
    ).toBe('Run plugin command "/review".\n\nReview changed files.\n\nArguments: --staged')
  })

  it('renderPluginCommandPrompt includes argument schema when declared', () => {
    expect(
      renderPluginCommandPrompt(
        {
          name: 'review',
          prompt: 'Review $ARGUMENTS.',
          arguments: [
            {
              name: 'path',
              description: 'Target path',
              required: true,
              choices: ['src/app.ts', 'src/index.ts'],
              default: 'src/app.ts',
            },
            { name: 'focus', required: false },
          ],
        },
        ['src/app.ts'],
      ),
    ).toBe(
      'Review src/app.ts.\n\nArgument schema:\n- path (required, string, choices: src/app.ts, src/index.ts, default: src/app.ts): Target path\n- focus (optional, string)',
    )
  })

  it('renderPluginCommandPrompt uses plugin prompt body and Claude-style arguments', () => {
    expect(
      renderPluginCommandPrompt(
        { name: 'review', description: 'Review changed files.', prompt: 'Review $ARGUMENTS.' },
        ['src/app.ts'],
      ),
    ).toBe('Review src/app.ts.')
  })

  it('renderPluginAgentPrompt includes description, tools, prompt body, and task', () => {
    expect(
      renderPluginAgentPrompt(
        {
          name: 'reviewer',
          description: 'Review code.',
          prompt: 'Focus on correctness.',
          tools: ['read', 'grep'],
        },
        ['src/app.ts'],
      ),
    ).toBe(
      'Run plugin agent "reviewer".\n\nReview code.\n\nPreferred tools: read, grep\n\nFocus on correctness.\n\nTask: src/app.ts',
    )
  })

  it('InteractiveMode shows context diagnostics without prompt content by default', async () => {
    const session = await createSession('interactive-context')
    const mode = new InteractiveMode(session)

    await mode.handleInput('hello diagnostics')

    const hidden = await mode.handleInput('/context')
    expect(hidden.type).toBe('system')
    if (hidden.type === 'system') {
      expect(hidden.text).toContain('Prompt sections:')
      expect(hidden.text).toContain('Prompt content hidden')
      expect(hidden.text).not.toContain('\nsystem\n')
    }

    const visible = await mode.handleInput('/context --show-prompt')
    expect(visible.type).toBe('system')
    if (visible.type === 'system') {
      expect(visible.text).toContain('\nsystem')
      expect(visible.text).not.toContain('Prompt content hidden')
    }
  })

  it('getLastAssistantText returns empty string when no assistant text exists', () => {
    const text = getLastAssistantText([
      { role: 'user', timestamp: Date.now(), content: [{ type: 'text', text: 'only user' }] },
    ])

    expect(text).toBe('')
  })
})
