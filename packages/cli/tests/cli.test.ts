import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultProviderRegistry, createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { InteractiveMode, runJsonMode, runPrintMode } from '@vitamin/coding'
import { createFilePluginStateStore } from '@vitamin/tools'

import { createVitamin, type VitaminAppOptions } from '@vitamin/coding'
import { createInMemoryResourceManager } from '@vitamin/resources'
import { formatPluginDiagnostics, parseCLI, runPluginCommand } from '../src/cli'

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

function makeBaseOptions(overrides: Partial<VitaminAppOptions> = {}): VitaminAppOptions {
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
  let app: ReturnType<typeof createVitamin> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('runPrintMode writes final assistant output', async () => {
    const writes: string[] = []
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nLead output.'),
    }))
    await app.start()

    const session = await app.createSession()
    const result = await runPrintMode(session, 'Explain', (text) => writes.push(text))

    expect(result).toBe('done\nLead output.')
    expect(writes).toEqual(['done\nLead output.'])
  })

  it('runJsonMode returns structured session output', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done_with_concerns\nTests need rerun.'),
    }))
    await app.start()

    const session = await app.createSession()
    const result = await runJsonMode(session, 'Review this change')

    expect(result.status).toBe('completed')
    expect(result.response).toBe('done_with_concerns\nTests need rerun.')
    expect(result.sessionId).toBeTruthy()
  })

  it('InteractiveMode reuses the same session across prompts', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nInteractive result.'),
    }))
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
    app = createVitamin(makeBaseOptions())
    await app.start()

    const session = await app.createSession()
    const interactive = new InteractiveMode(session)
    const result = await interactive.handleInput('/compact 1 summary')

    expect(result).toEqual({ type: 'system', text: 'Compaction complete.' })
  })
})

describe('parseCLI', () => {
  it('defaults to interactive mode when no prompt is provided', () => {
    const parsed = parseCLI(['node', 'vitamin'])

    expect(parsed.options.mode).toBe('interactive')
    expect(parsed.options.prompt).toBeUndefined()
  })

  it('supports explicit print mode flag', () => {
    const parsed = parseCLI(['node', 'vitamin', '--print', 'hello'])

    expect(parsed.options.mode).toBe('print')
    expect(parsed.options.prompt).toBe('hello')
  })
})

describe('plugin diagnostics formatting', () => {
  it('shows lifecycle steps and skipped reasons for plugin list output', () => {
    const output = formatPluginDiagnostics({
      roots: ['/workspace/.vitamin/plugins'],
      state: { trustedPluginIds: ['review'], disabledPluginIds: [] },
      discovered: [
        {
          path: '/workspace/.vitamin/plugins/review/plugin.json',
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
          manifestPath: '/workspace/.vitamin/plugins/review/plugin.json',
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

    expect(output).toContain('review\tloaded\ttrusted\t/workspace/.vitamin/plugins/review/plugin.json')
    expect(output).toContain('command:review\tskipped\tcommand adapter is not configured')
    expect(output).toContain('agent:reviewer\tskipped\tagent adapter is not configured')
  })

  it('persists plugin state changes from plugin commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vitamin-cli-plugin-state-'))
    const pluginRoot = join(root, '.vitamin/plugins')
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
    const pluginApp = createVitamin(makeBaseOptions({
      workspaceDir: root,
      pluginRoots: [pluginRoot],
      pluginStateStore: stateStore,
    }))
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
    const root = await mkdtemp(join(tmpdir(), 'vitamin-cli-claude-import-'))
    const pluginRoot = join(root, '.vitamin/plugins')
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

    const pluginApp = createVitamin(makeBaseOptions({
      workspaceDir: root,
      pluginRoots: [pluginRoot],
    }))
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
