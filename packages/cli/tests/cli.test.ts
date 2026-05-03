import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDefaultProviderRegistry,
  createEventStream,
  type AssistantMessage,
  type Model,
  type StreamContext,
  type StreamEvent,
} from '@x-mars/ai'
import { createHookRegistry } from '@x-mars/hooks'
import { InteractiveMode, runJsonMode, runJsonStreamMode, runPrintMode } from '@x-mars/coding'
import { createFilePluginStateStore } from '@x-mars/tools'

import { createXMars, type XMarsAppOptions } from '@x-mars/coding'
import { createInMemoryResourceManager } from '@x-mars/resources'
import {
  buildRepositoryWorkflowPrompt,
  formatPluginDiagnostics,
  getCiExitCode,
  parseCLI,
  readStdinPrompt,
  resolveConfigLayerPaths,
  runConfigCommand,
  runPluginCommand,
  runRpcLoop,
} from '../src/cli'

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

function makeProviderRegistry(
  responseText = 'done\nAll tasks completed.',
  onConverse?: (context: StreamContext) => void,
) {
  const providerRegistry = createDefaultProviderRegistry()
  providerRegistry.register('openai-completions', () => ({
    id: 'test-provider',
    displayName: 'Test Provider',
    converse(_model, context, _options, _signal) {
      onConverse?.(context)
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: responseText }],
        stopReason: 'end_turn',
        model: 'test-model',
        api: 'openai-completions',
        provider: 'openai',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }
      setTimeout(() => {
        eventStream.push({ type: 'start', partial: response })
        eventStream.push({ type: 'done', reason: 'end_turn', message: response })
        eventStream.complete(response)
      }, 0)
      return eventStream
    },
  }))
  return providerRegistry
}

function makeBaseOptions(overrides: Partial<XMarsAppOptions> = {}): XMarsAppOptions {
  return {
    port: 0,
    inspect: false,
    logger: { name: 'test', level: 'error', destination: 'stdout' },
    model: makeModel(),
    providerRegistry: makeProviderRegistry(),
    hooks: createHookRegistry({ preset: 'none' }),
    resourceManager: createInMemoryResourceManager(),
    ...overrides,
  }
}

describe('CLI session modes', () => {
  let app: ReturnType<typeof createXMars> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('runPrintMode writes final assistant output', async () => {
    const writes: string[] = []
    app = createXMars(
      makeBaseOptions({
        providerRegistry: makeProviderRegistry('done\nLead output.'),
      }),
    )
    await app.start()

    const session = await app.createSession()
    const result = await runPrintMode(session, 'Explain', (text) => writes.push(text))

    expect(result).toBe('done\nLead output.')
    expect(writes).toEqual(['done\nLead output.'])
  })

  it('runJsonMode returns structured session output', async () => {
    app = createXMars(
      makeBaseOptions({
        providerRegistry: makeProviderRegistry('done_with_concerns\nTests need rerun.'),
      }),
    )
    await app.start()

    const session = await app.createSession()
    const result = await runJsonMode(session, 'Review this change')

    expect(result.status).toBe('completed')
    expect(result.response).toBe('done_with_concerns\nTests need rerun.')
    expect(result.sessionId).toBeTruthy()
  })

  it('runJsonStreamMode emits session events and a final result', async () => {
    app = createXMars(
      makeBaseOptions({
        providerRegistry: makeProviderRegistry('done\nStream result.'),
      }),
    )
    await app.start()

    const session = await app.createSession()
    const events: Array<{ type: string; data?: Record<string, unknown> }> = []
    const result = await runJsonStreamMode(session, 'Stream this', (event) => events.push(event))

    expect(result.response).toBe('done\nStream result.')
    expect(events.some((event) => event.type === 'prompt_start')).toBe(true)
    expect(events.some((event) => event.type === 'stream_event')).toBe(true)
    expect(events.at(-1)?.type).toBe('result')
  })

  it('runRpcLoop processes newline-delimited JSON RPC requests', async () => {
    app = createXMars(
      makeBaseOptions({
        providerRegistry: makeProviderRegistry('done\nRPC result.'),
      }),
    )
    await app.start()

    const session = await app.createSession()
    const input = Readable.from([
      JSON.stringify({ id: '1', method: 'status' }) + '\n',
      JSON.stringify({ id: '2', method: 'prompt', params: { text: 'Run rpc' } }) + '\n',
    ])
    const lines: string[] = []

    await runRpcLoop(session, input, (line) => lines.push(line))

    const responses = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(responses).toHaveLength(2)
    expect(responses[0]).toMatchObject({ id: '1', ok: true })
    expect(responses[1]).toMatchObject({ id: '2', ok: true })
    expect(responses[1]?.result).toMatchObject({ response: 'done\nRPC result.' })
  })

  it('runRpcLoop returns structured errors for invalid JSON lines', async () => {
    app = createXMars(makeBaseOptions())
    await app.start()

    const session = await app.createSession()
    const lines: string[] = []

    await runRpcLoop(session, Readable.from(['not-json\n']), (line) => lines.push(line))

    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ ok: false })
  })

  it('InteractiveMode reuses the same session across prompts', async () => {
    app = createXMars(
      makeBaseOptions({
        providerRegistry: makeProviderRegistry('done\nInteractive result.'),
      }),
    )
    await app.start()

    const session = await app.createSession()
    const interactive = new InteractiveMode(session)

    const first = await interactive.handleInput('First prompt')
    const firstSessionId = session.id
    const second = await interactive.handleInput('Second prompt')
    const secondSessionId = session.id

    expect(first.type).toBe('response')
    expect(second.type).toBe('response')
    expect(firstSessionId).toBeTruthy()
    expect(secondSessionId).toBe(firstSessionId)
  })

  it('InteractiveMode can compact the current session before first prompt', async () => {
    app = createXMars(makeBaseOptions())
    await app.start()

    const session = await app.createSession()
    const interactive = new InteractiveMode(session)
    const result = await interactive.handleInput('/compact 1 summary')

    expect(result).toEqual({ type: 'system', text: 'Compaction complete.' })
  })
})

describe('parseCLI', () => {
  it('defaults to interactive mode when no prompt is provided', () => {
    const parsed = parseCLI(['node', 'x-mars'])

    expect(parsed.options.mode).toBe('interactive')
    expect(parsed.options.prompt).toBeUndefined()
  })

  it('supports explicit print mode flag', () => {
    const parsed = parseCLI(['node', 'x-mars', '--print', 'hello'])

    expect(parsed.options.mode).toBe('print')
    expect(parsed.options.prompt).toBe('hello')
  })

  it('supports json-stream mode flag', () => {
    const parsed = parseCLI(['node', 'x-mars', '--json-stream', 'hello'])

    expect(parsed.options.mode).toBe('json-stream')
    expect(parsed.options.prompt).toBe('hello')
  })

  it('supports CI mode flag', () => {
    const parsed = parseCLI(['node', 'x-mars', '--ci', '--json', 'hello'])

    expect(parsed.options.ci).toBe(true)
    expect(parsed.options.mode).toBe('json')
  })

  it('supports controlled commit and PR workflow flags', () => {
    const parsed = parseCLI([
      'node',
      'x-mars',
      '--json',
      '--commit',
      '--pr',
      '--base',
      'main',
      '--draft',
      'finish task',
    ])

    expect(parsed.options.mode).toBe('json')
    expect(parsed.options.prompt).toBe('finish task')
    expect(parsed.options.workflow).toEqual({
      commit: true,
      pr: true,
      base: 'main',
      draft: true,
    })
  })

  it('defaults workflow-only invocations to print mode', () => {
    const parsed = parseCLI(['node', 'x-mars', '--commit'])

    expect(parsed.options.mode).toBe('print')
    expect(parsed.options.workflow).toEqual({ commit: true })
  })

  it('builds repository workflow prompt constraints', () => {
    const prompt = buildRepositoryWorkflowPrompt('Ship the CLI change', {
      commit: true,
      pr: true,
      base: 'main',
      draft: true,
    })

    expect(prompt).toContain('Ship the CLI change')
    expect(prompt).toContain('Repository workflow constraints:')
    expect(prompt).toContain('stage only files relevant to this task')
    expect(prompt).toContain('create a pull request targeting main as a draft')
  })

  it('reads non-interactive prompt from stdin', async () => {
    const input = Readable.from(['hello from stdin\n'])

    await expect(readStdinPrompt(input)).resolves.toBe('hello from stdin')
  })

  it('maps CI results to stable exit codes', () => {
    expect(getCiExitCode({ status: 'completed', response: 'done\nok' })).toBe(0)
    expect(
      getCiExitCode({ status: 'completed', response: 'done_with_concerns\nneeds review' }),
    ).toBe(2)
    expect(getCiExitCode({ status: 'failed', response: '' })).toBe(1)
  })
})

describe('config command', () => {
  it('prints resolved config layer paths', () => {
    const paths = resolveConfigLayerPaths(
      {
        projectDir: '/workspace',
        configPath: undefined,
      },
      {
        X_MARS_HOME: '/home/user/.x-mars',
        X_MARS_MANAGED_CONFIG: '/managed/x-mars.jsonc',
      },
    )

    expect(paths).toEqual({
      user: '/home/user/.x-mars/config.jsonc',
      project: '/workspace/.x-mars/config.jsonc',
      projectLocal: '/workspace/.x-mars/config.local.jsonc',
      managed: '/managed/x-mars.jsonc',
    })
  })

  it('reads merged config values from the current workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-cli-config-'))
    await mkdir(join(root, '.x-mars'), { recursive: true })
    await writeFile(
      join(root, '.x-mars/config.jsonc'),
      JSON.stringify({ model: 'project-model', theme: 'light' }),
      'utf-8',
    )
    await writeFile(
      join(root, '.x-mars/config.local.jsonc'),
      JSON.stringify({ model: 'local-model' }),
      'utf-8',
    )

    const writes: string[] = []
    const code = await runConfigCommand(
      'get model',
      { projectDir: root, configPath: undefined },
      (text) => writes.push(text),
    )

    expect(code).toBe(0)
    expect(JSON.parse(writes.join(''))).toBe('local-model')
  })

  it('prints config paths without loading the app runtime', async () => {
    const writes: string[] = []
    const code = await runConfigCommand(
      'path',
      { projectDir: '/workspace', configPath: '/workspace/custom.jsonc' },
      (text) => writes.push(text),
    )

    expect(code).toBe(0)
    expect(writes.join('')).toContain('project\t/workspace/custom.jsonc')
    expect(writes.join('')).toContain('project-local\t/workspace/.x-mars/config.local.jsonc')
  })

  it('writes config values to the project-local layer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-cli-config-set-'))
    const writes: string[] = []

    const code = await runConfigCommand(
      'set model "local-model"',
      { projectDir: root, configPath: undefined },
      (text) => writes.push(text),
    )

    const content = await readFile(join(root, '.x-mars/config.local.jsonc'), 'utf-8')
    const config = JSON.parse(content) as Record<string, unknown>

    expect(code).toBe(0)
    expect(writes.join('')).toContain('Updated model')
    expect(config.model).toBe('local-model')
  })

  it('writes nested config values to the project-local layer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-cli-config-set-nested-'))

    const code = await runConfigCommand(
      'set workflow.max_active_tasks 4',
      { projectDir: root, configPath: undefined },
      () => {},
    )

    const content = await readFile(join(root, '.x-mars/config.local.jsonc'), 'utf-8')
    const config = JSON.parse(content) as { workflow?: { max_active_tasks?: number } }

    expect(code).toBe(0)
    expect(config.workflow?.max_active_tasks).toBe(4)
  })
})

describe('plugin diagnostics formatting', () => {
  it('shows lifecycle steps and skipped reasons for plugin list output', () => {
    const output = formatPluginDiagnostics({
      roots: ['/workspace/.x-mars/plugins'],
      state: { trustedPluginIds: ['review'], disabledPluginIds: [] },
      discovered: [
        {
          path: '/workspace/.x-mars/plugins/review/plugin.json',
          manifest: {
            id: 'review',
            name: 'Review',
            version: '1.0.0',
            commands: [{ name: 'review' }],
            agents: [{ name: 'reviewer' }],
          },
          validation: { valid: true, errors: [], warnings: [] },
        },
      ],
      loaded: [
        {
          pluginId: 'review',
          manifestPath: '/workspace/.x-mars/plugins/review/plugin.json',
          manifest: {
            id: 'review',
            name: 'Review',
            version: '1.0.0',
            commands: [{ name: 'review' }],
            agents: [{ name: 'reviewer' }],
          },
          hookNames: [],
          result: {
            pluginId: 'review',
            enabled: true,
            errors: [],
            warnings: [],
            steps: [
              {
                type: 'command',
                name: 'review',
                status: 'skipped',
                warning: 'command adapter is not configured',
              },
              {
                type: 'agent',
                name: 'reviewer',
                status: 'skipped',
                warning: 'agent adapter is not configured',
              },
            ],
          },
        },
      ],
      results: [
        {
          pluginId: 'review',
          enabled: true,
          errors: [],
          warnings: [],
          steps: [
            {
              type: 'command',
              name: 'review',
              status: 'skipped',
              warning: 'command adapter is not configured',
            },
            {
              type: 'agent',
              name: 'reviewer',
              status: 'skipped',
              warning: 'agent adapter is not configured',
            },
          ],
        },
      ],
      errors: [],
    })

    expect(output).toContain(
      'review\tloaded\ttrusted\t/workspace/.x-mars/plugins/review/plugin.json',
    )
    expect(output).toContain('command:review\tskipped\tcommand adapter is not configured')
    expect(output).toContain('agent:reviewer\tskipped\tagent adapter is not configured')
  })

  it('persists plugin state changes from plugin commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-cli-plugin-state-'))
    const pluginRoot = join(root, '.x-mars/plugins')
    const pluginDir = join(pluginRoot, 'review')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'review',
        name: 'Review',
        version: '1.0.0',
        commands: [{ name: 'review' }],
      }),
      'utf-8',
    )

    const stateStore = createFilePluginStateStore({ workspaceDir: root })
    const pluginApp = createXMars(
      makeBaseOptions({
        workspaceDir: root,
        pluginRoots: [pluginRoot],
        pluginStateStore: stateStore,
      }),
    )
    await pluginApp.start()

    const writes: string[] = []
    const originalWrite = process.stdout.write
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await runPluginCommand(pluginApp, 'trust review', stateStore)
      await runPluginCommand(pluginApp, 'disable review', stateStore)
    } finally {
      process.stdout.write = originalWrite
      await pluginApp.stop()
    }

    expect(writes.join('')).toContain('Plugin trusted: review')
    expect(writes.join('')).toContain('Plugin disabled: review')
    expect(await stateStore.load()).toEqual({
      trustedPluginIds: ['review'],
      disabledPluginIds: ['review'],
    })
  })

  it('imports a Claude Code plugin into the project plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'x-mars-cli-claude-import-'))
    const pluginRoot = join(root, '.x-mars/plugins')
    const sourceDir = join(root, 'claude-review')
    await mkdir(join(sourceDir, '.claude-plugin'), { recursive: true })
    await mkdir(join(sourceDir, 'skills/review'), { recursive: true })
    await mkdir(join(sourceDir, 'commands'), { recursive: true })
    await writeFile(
      join(sourceDir, '.claude-plugin/plugin.json'),
      JSON.stringify({
        name: 'claude-review',
        description: 'Claude Review',
        version: '1.2.3',
      }),
      'utf-8',
    )
    await writeFile(
      join(sourceDir, 'skills/review/SKILL.md'),
      '---\nname: review-skill\n---\n# Review skill\n',
      'utf-8',
    )
    await writeFile(
      join(sourceDir, 'commands/review.md'),
      '---\nname: review\n---\nReview command\n',
      'utf-8',
    )

    const pluginApp = createXMars(
      makeBaseOptions({
        workspaceDir: root,
        pluginRoots: [pluginRoot],
      }),
    )
    await pluginApp.start()

    const writes: string[] = []
    const originalWrite = process.stdout.write
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      const code = await runPluginCommand(pluginApp, `import-claude-code ${sourceDir}`)
      expect(code).toBe(0)
    } finally {
      process.stdout.write = originalWrite
      await pluginApp.stop()
    }

    const output = writes.join('')
    const manifest = JSON.parse(
      await readFile(join(pluginRoot, 'claude-review/plugin.json'), 'utf-8'),
    ) as { id: string; skills?: unknown[]; commands?: unknown[] }

    expect(output).toContain('Claude Code plugin imported: claude-review')
    expect(output).toContain('skills\t1')
    expect(output).toContain('commands\t1')
    expect(manifest.id).toBe('claude-review')
    expect(manifest.skills).toHaveLength(1)
    expect(manifest.commands).toHaveLength(1)
  })
})
