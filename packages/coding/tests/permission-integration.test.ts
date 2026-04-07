// Permission system integration tests
// Verifies that VitaminApp correctly wires PermissionPolicyRegistry + PermissionGuardHook
// into the hook registry, and that settings changes dynamically update policies.
import { describe, expect, it } from 'vitest'
import {
  createHookRegistry,
  PermissionPolicyRegistry,
  PermissionAuditLog,
  createPermissionGuardHook,
  FILE_GUARD_POLICY,
  DESTRUCTIVE_COMMAND_POLICY,
  createPermissionModePolicy,
  createDisabledToolsPolicy,
  createDirectoryFreezePolicy,
  createAgentBoundaryPolicy,
  compilePolicyFromConfig,
} from '@vitamin/hooks'
import type { ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '@vitamin/hooks'
import { Agent, type AgentMessage } from '@vitamin/agent'
import {
  createEventStream,
  createProviderRegistry,
  type AssistantMessage,
  type Model,
  type StreamContext,
  type StreamEvent,
  type ToolCall,
} from '@vitamin/ai'
import { createInMemorySessionStore } from '@vitamin/session'
import { createLogger } from '@vitamin/shared'
import { AgentSession } from '../src/session/agent-session'
import { createVitamin } from '../src/app/vitamin-app'

// ═══ Helpers ═══

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

function makeAssistantMessage(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'],
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openai',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason,
    model: 'openai/test-model',
  }
}

function makeToolCall(name: string, id: string, args: Record<string, unknown> = {}): ToolCall {
  return { type: 'tool_call', id, name, arguments: args }
}

function createSchema<T>() {
  return {
    parse(input: unknown) { return input as T },
    safeParse(input: unknown) { return { success: true as const, data: input as T } },
  }
}

function createTestTool(name: string, readonly = false) {
  return {
    name,
    description: `${name} tool`,
    readonly,
    parameters: createSchema<Record<string, unknown>>() as never,
    async execute() {
      return { content: [{ type: 'text' as const, text: `${name}:ok` }] }
    },
  }
}

function makeBeforeInput(overrides: Partial<ToolExecuteBeforeInput> = {}): ToolExecuteBeforeInput {
  return {
    toolName: 'read',
    toolCallId: 'tc-1',
    args: {},
    agentName: 'lead',
    sessionId: 'sess-1',
    ...overrides,
  }
}

function makeBeforeOutput(args: Record<string, unknown> = {}): ToolExecuteBeforeOutput {
  return { args, cancelled: false }
}

// ═══ Permission Guard integrated with HookRegistry ═══

describe('Permission guard through HookRegistry', () => {
  it('permission-guard hook blocks denied tools via hookRegistry.execute', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createDisabledToolsPolicy(['bash']))

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry))

    const input = makeBeforeInput({ toolName: 'bash', args: { command: 'ls' } })
    const output = makeBeforeOutput({ command: 'ls' })

    // PermissionGuardHook throws ToolError on deny, HookRegistry.execute catches it
    await hooks.execute('tool.execute.before', input, output)
    expect(output.cancelled).toBe(true)
    expect(output.cancelReason).toContain('Permission denied')
  })

  it('permission-guard hook allows unrestricted tools', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createDisabledToolsPolicy(['bash']))

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry))

    const input = makeBeforeInput({ toolName: 'read', args: { path: '/project/src/a.ts' } })
    const output = makeBeforeOutput({ path: '/project/src/a.ts' })

    await hooks.execute('tool.execute.before', input, output)
    expect(output.cancelled).toBe(false)
  })

  it('audit log records all permission decisions', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(FILE_GUARD_POLICY)

    const auditLog = new PermissionAuditLog()
    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry, auditLog))

    // Allowed operation
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'read', args: { path: '/etc/hosts' } }),
      makeBeforeOutput({ path: '/etc/hosts' }),
    )

    // Denied operation
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'write', args: { path: '/etc/passwd' } }),
      makeBeforeOutput({ path: '/etc/passwd' }),
    )

    expect(auditLog.size).toBe(2)
    expect(auditLog.getEntries()[0]!.decision.effect).toBe('allow')
    expect(auditLog.getEntries()[1]!.decision.effect).toBe('deny')
  })
})

// ═══ Permission guard in real tool execution pipeline ═══

describe('Permission guard in AgentSession tool execution', () => {
  it('blocked tool returns error result to LLM', async () => {
    const toolResults: string[] = []

    const stream = (context: StreamContext, _signal: AbortSignal) => {
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      setTimeout(() => {
        const hasToolResult = context.messages.some(m =>
          typeof m === 'object' && m !== null && 'role' in m && m.role === 'tool_result',
        )

        const response = hasToolResult
          ? makeAssistantMessage([{ type: 'text', text: 'understood' }], 'end_turn')
          : makeAssistantMessage(
              [makeToolCall('bash', 'tc_bash', { command: 'rm -rf /' })],
              'tool_use',
            )
        eventStream.push({ type: 'start', partial: response })
        eventStream.complete(response)
      }, 0)
      return eventStream
    }

    const hooks = createHookRegistry({ preset: 'none' })
    const permRegistry = new PermissionPolicyRegistry()
    permRegistry.register(createDisabledToolsPolicy(['bash']))
    hooks.register(createPermissionGuardHook(permRegistry))

    const bashTool = createTestTool('bash')
    const sessionStore = createInMemorySessionStore<AgentMessage>()
    const session = await sessionStore.createSession('perm-test-1')
    const agent = new Agent({ stream })

    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'test',
      tools: [bashTool],
      hookRegistry: hooks,
      logger: createLogger('perm-test', { level: 'info', destination: 'stdout' }),
    })

    await agentSession.prompt('run bash')

    // The tool_result should contain the denial message
    const messages = session.messages()
    const toolResult = messages.find(m =>
      typeof m === 'object' && m !== null && 'role' in m && m.role === 'tool_result',
    ) as { role: 'tool_result'; content: Array<{ type: string; text?: string }> } | undefined

    expect(toolResult).toBeDefined()
    expect(toolResult!.content[0]?.text).toContain('Permission denied')
  })

  it('allowed tool executes normally', async () => {
    const stream = (context: StreamContext, _signal: AbortSignal) => {
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      setTimeout(() => {
        const hasToolResult = context.messages.some(m =>
          typeof m === 'object' && m !== null && 'role' in m && m.role === 'tool_result',
        )

        const response = hasToolResult
          ? makeAssistantMessage([{ type: 'text', text: 'done' }], 'end_turn')
          : makeAssistantMessage(
              [makeToolCall('read', 'tc_read', { path: '/project/src/index.ts' })],
              'tool_use',
            )
        eventStream.push({ type: 'start', partial: response })
        eventStream.complete(response)
      }, 0)
      return eventStream
    }

    const hooks = createHookRegistry({ preset: 'none' })
    const permRegistry = new PermissionPolicyRegistry()
    permRegistry.register(createPermissionModePolicy('auto'))
    permRegistry.register(FILE_GUARD_POLICY)
    hooks.register(createPermissionGuardHook(permRegistry))

    const readTool = createTestTool('read', true)
    const sessionStore = createInMemorySessionStore<AgentMessage>()
    const session = await sessionStore.createSession('perm-test-2')
    const agent = new Agent({ stream })

    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'test',
      tools: [readTool],
      hookRegistry: hooks,
      logger: createLogger('perm-test', { level: 'info', destination: 'stdout' }),
    })

    await agentSession.prompt('read file')

    const messages = session.messages()
    const toolResult = messages.find(m =>
      typeof m === 'object' && m !== null && 'role' in m && m.role === 'tool_result',
    ) as { role: 'tool_result'; content: Array<{ type: string; text?: string }> } | undefined

    expect(toolResult).toBeDefined()
    expect(toolResult!.content[0]?.text).toBe('read:ok')
  })
})

// ═══ VitaminApp permission policy integration ═══

describe('VitaminApp permission policy wiring', () => {
  function createTestApp(hookRegistry?: ReturnType<typeof createHookRegistry>) {
    const providerRegistry = createProviderRegistry()
    providerRegistry.register('openai-completions', () => ({
      id: 'test-provider',
      displayName: 'Test Provider',
      converse(_model: Model, _context: StreamContext, _options: unknown, _signal: AbortSignal) {
        const eventStream = createEventStream<StreamEvent, AssistantMessage>()
        const response = makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')
        setTimeout(() => {
          eventStream.push({ type: 'start', partial: response })
          eventStream.complete(response)
        }, 0)
        return eventStream
      },
    }))

    return createVitamin({
      port: 0,
      inspect: false,
      logger: { name: 'perm-test', level: 'error', destination: 'stdout' },
      model: makeModel(),
      providerRegistry,
      hookRegistry,
    })
  }

  it('registers permission-guard hook on initialization', () => {
    const app = createTestApp()
    const registered = app.hookRegistry.getRegistered('tool.execute.before')
    const guardHook = registered.find(h => h.name === 'permission-guard')

    expect(guardHook).toBeDefined()
    expect(guardHook!.priority).toBe(5)
    expect(guardHook!.enabled).toBe(true)
  })

  it('initializes with builtin policies', () => {
    const app = createTestApp()
    const policies = app.permissionRegistry.getAll()
    const policyNames = policies.map(p => p.name)

    expect(policyNames).toContain('mode:auto')
    expect(policyNames).toContain('builtin:file-guard')
    expect(policyNames).toContain('builtin:destructive-guard')
  })

  it('exposes auditLog for querying permission decisions', () => {
    const app = createTestApp()
    expect(app.auditLog).toBeDefined()
    expect(app.auditLog.size).toBe(0)
  })

  it('syncs permission mode from settings.update', async () => {
    const app = createTestApp()
    await app.start()

    // Default is auto mode
    let policies = app.permissionRegistry.getAll()
    expect(policies.some(p => p.name === 'mode:auto')).toBe(true)

    // Update to readonly mode
    await app.settings.update({ permission_mode: 'readonly' })

    policies = app.permissionRegistry.getAll()
    expect(policies.some(p => p.name === 'mode:readonly')).toBe(true)
    expect(policies.some(p => p.name === 'mode:auto')).toBe(false)

    await app.stop()
  })

  it('syncs disabled_tools from settings.update', async () => {
    const app = createTestApp()
    await app.start()

    // No disabled tools initially
    expect(app.permissionRegistry.has('setting:disabled-tools')).toBe(false)

    // Disable bash
    await app.settings.update({ disabled_tools: ['bash', 'web-search'] })
    expect(app.permissionRegistry.has('setting:disabled-tools')).toBe(true)

    // Clear disabled tools
    await app.settings.update({ disabled_tools: [] })
    expect(app.permissionRegistry.has('setting:disabled-tools')).toBe(false)

    await app.stop()
  })

  it('syncs user permission policies from settings.update', async () => {
    const app = createTestApp()
    await app.start()

    await app.settings.update({
      permissions: [
        {
          name: 'my-project-rules',
          priority: 30,
          rules: [
            { name: 'deny-delete', effect: 'deny', tools: ['delete'], deny_reason: 'No deleting' },
          ],
        },
      ],
    })

    expect(app.permissionRegistry.has('user:my-project-rules')).toBe(true)

    // Remove user policies
    await app.settings.update({ permissions: [] })
    expect(app.permissionRegistry.has('user:my-project-rules')).toBe(false)

    await app.stop()
  })
})

// ═══ Combined pipeline: mode + builtin + agent boundary ═══

describe('Combined permission pipeline scenarios', () => {
  it('readonly mode + file guard: reads succeed, writes rejected', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('readonly'))
    registry.register(FILE_GUARD_POLICY)

    const hooks = createHookRegistry({ preset: 'none' })
    const auditLog = new PermissionAuditLog()
    hooks.register(createPermissionGuardHook(registry, auditLog))

    // Read allowed
    const readOutput = makeBeforeOutput({ path: '/etc/hosts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'read', args: { path: '/etc/hosts' } }),
      readOutput,
    )
    expect(readOutput.cancelled).toBe(false)

    // Write denied by readonly
    const writeOutput = makeBeforeOutput({ path: '/project/foo.ts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'write', args: { path: '/project/foo.ts' } }),
      writeOutput,
    )
    expect(writeOutput.cancelled).toBe(true)
  })

  it('agent boundary restricts undeclared tool access', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('auto'))
    registry.register(createAgentBoundaryPolicy('web-agent', ['web-search', 'web-fetch', 'read']))

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry))

    // web-agent can search
    const searchOutput = makeBeforeOutput()
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ agentName: 'web-agent', toolName: 'web-search' }),
      searchOutput,
    )
    expect(searchOutput.cancelled).toBe(false)

    // web-agent cannot write
    const writeOutput = makeBeforeOutput({ path: '/project/x.ts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ agentName: 'web-agent', toolName: 'write', args: { path: '/project/x.ts' } }),
      writeOutput,
    )
    expect(writeOutput.cancelled).toBe(true)

    // lead agent is unrestricted
    const leadOutput = makeBeforeOutput({ path: '/project/x.ts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ agentName: 'lead', toolName: 'write', args: { path: '/project/x.ts' } }),
      leadOutput,
    )
    expect(leadOutput.cancelled).toBe(false)
  })

  it('directory freeze limits write scope', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('auto'))
    registry.register(FILE_GUARD_POLICY)
    registry.register(createDirectoryFreezePolicy('/project/src'))

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry))

    // Within scope
    const inOutput = makeBeforeOutput({ path: '/project/src/app.ts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'edit', args: { path: '/project/src/app.ts' } }),
      inOutput,
    )
    expect(inOutput.cancelled).toBe(false)

    // Outside scope
    const outOutput = makeBeforeOutput({ path: '/project/tests/foo.test.ts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'edit', args: { path: '/project/tests/foo.test.ts' } }),
      outOutput,
    )
    expect(outOutput.cancelled).toBe(true)
  })

  it('confirm mode sets [CONFIRM] prefix for writes', async () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('confirm'))

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry))

    const output = makeBeforeOutput({ path: '/project/foo.ts' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'write', args: { path: '/project/foo.ts' } }),
      output,
    )
    expect(output.cancelled).toBe(false)
    expect(output.cancelReason).toMatch(/^\[CONFIRM\]/)
  })

  it('compilePolicyFromConfig integrates with registry evaluate', async () => {
    const policy = compilePolicyFromConfig({
      name: 'yaml-policy',
      priority: 25,
      rules: [
        { name: 'deny-bash', effect: 'deny', tools: ['bash'], deny_reason: 'No shell access' },
        { name: 'allow-rest', effect: 'allow' },
      ],
    })

    const registry = new PermissionPolicyRegistry()
    registry.register(policy)

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createPermissionGuardHook(registry))

    // bash denied
    const bashOutput = makeBeforeOutput({ command: 'ls' })
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'bash', args: { command: 'ls' } }),
      bashOutput,
    )
    expect(bashOutput.cancelled).toBe(true)

    // read allowed
    const readOutput = makeBeforeOutput()
    await hooks.execute('tool.execute.before',
      makeBeforeInput({ toolName: 'read' }),
      readOutput,
    )
    expect(readOutput.cancelled).toBe(false)
  })
})
