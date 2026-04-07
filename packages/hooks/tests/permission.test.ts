// Permission system tests
import { describe, expect, it } from 'vitest'

import {
  PermissionPolicyRegistry,
  PermissionAuditLog,
  createPermissionGuardHook,
  FILE_GUARD_POLICY,
  DESTRUCTIVE_COMMAND_POLICY,
  createDirectoryFreezePolicy,
  createDisabledToolsPolicy,
  createAgentBoundaryPolicy,
  createPermissionModePolicy,
  compilePolicyFromSetting,
} from '../src/core/permission'

import type {
  PermissionPolicy,
  PermissionContext,
  PermissionPolicySetting,
} from '../src/core/permission'
import type { ToolExecuteBeforeInput, ToolExecuteBeforeOutput } from '../src/types'

function makeContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    timing: 'tool.execute.before',
    toolName: 'read',
    args: {},
    agentName: 'lead',
    sessionId: 'sess-1',
    metadata: {},
    ...overrides,
  }
}

// ═══ PermissionPolicyRegistry ═══

describe('PermissionPolicyRegistry', () => {
  describe('#evaluate', () => {
    it('returns allow by default when no policies registered', () => {
      const registry = new PermissionPolicyRegistry()
      const decision = registry.evaluate(makeContext())

      expect(decision.effect).toBe('allow')
      expect(decision.policyName).toBe('__default__')
      expect(decision.evaluatedPolicies).toBe(0)
    })

    it('evaluates policies by priority order', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'low-priority',
        priority: 100,
        enabled: true,
        scope: {},
        rules: [{ name: 'deny-all', effect: 'deny', match: {} }],
      })
      registry.register({
        name: 'high-priority',
        priority: 1,
        enabled: true,
        scope: {},
        rules: [{ name: 'allow-all', effect: 'allow', match: {} }],
      })

      const decision = registry.evaluate(makeContext())
      expect(decision.effect).toBe('allow')
      expect(decision.policyName).toBe('high-priority')
    })

    it('first-match within policy rules', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'test-policy',
        priority: 10,
        enabled: true,
        scope: {},
        rules: [
          { name: 'allow-read', effect: 'allow', match: { tools: ['read'] } },
          { name: 'deny-all', effect: 'deny', match: {} },
        ],
      })

      const readDecision = registry.evaluate(makeContext({ toolName: 'read' }))
      expect(readDecision.effect).toBe('allow')
      expect(readDecision.ruleName).toBe('allow-read')

      const writeDecision = registry.evaluate(makeContext({ toolName: 'write' }))
      expect(writeDecision.effect).toBe('deny')
      expect(writeDecision.ruleName).toBe('deny-all')
    })

    it('skips disabled policies', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'disabled',
        priority: 1,
        enabled: false,
        scope: {},
        rules: [{ name: 'deny-all', effect: 'deny', match: {} }],
      })

      const decision = registry.evaluate(makeContext())
      expect(decision.effect).toBe('allow')
      expect(decision.evaluatedPolicies).toBe(0)
    })

    it('respects agent scope', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'agent-specific',
        priority: 10,
        enabled: true,
        scope: { agents: ['coder'] },
        rules: [{ name: 'deny-all', effect: 'deny', match: {} }],
      })

      // Does not apply to 'lead' agent
      const leadDecision = registry.evaluate(makeContext({ agentName: 'lead' }))
      expect(leadDecision.effect).toBe('allow')

      // Applies to 'coder' agent
      const coderDecision = registry.evaluate(makeContext({ agentName: 'coder' }))
      expect(coderDecision.effect).toBe('deny')
    })

    it('respects session scope', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'session-specific',
        priority: 10,
        enabled: true,
        scope: { sessions: ['sess-special'] },
        rules: [{ name: 'deny-all', effect: 'deny', match: {} }],
      })

      const normalDecision = registry.evaluate(makeContext({ sessionId: 'sess-1' }))
      expect(normalDecision.effect).toBe('allow')

      const specialDecision = registry.evaluate(makeContext({ sessionId: 'sess-special' }))
      expect(specialDecision.effect).toBe('deny')
    })

    it('matches by path patterns', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'path-policy',
        priority: 10,
        enabled: true,
        scope: {},
        rules: [{
          name: 'deny-env',
          effect: 'deny',
          match: { paths: [/\.env$/] },
        }],
      })

      const envDecision = registry.evaluate(makeContext({ filePath: '/project/.env' }))
      expect(envDecision.effect).toBe('deny')

      const jsDecision = registry.evaluate(makeContext({ filePath: '/project/index.js' }))
      expect(jsDecision.effect).toBe('allow')
    })

    it('matches by custom condition', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'condition-policy',
        priority: 10,
        enabled: true,
        scope: {},
        rules: [{
          name: 'deny-large-args',
          effect: 'deny',
          match: {
            condition: (ctx) => Object.keys(ctx.args).length > 5,
          },
        }],
      })

      const smallDecision = registry.evaluate(makeContext({ args: { a: 1 } }))
      expect(smallDecision.effect).toBe('allow')

      const largeDecision = registry.evaluate(makeContext({
        args: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
      }))
      expect(largeDecision.effect).toBe('deny')
    })
  })

  describe('#register / #unregister', () => {
    it('replaces policy with same name', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'test',
        priority: 10,
        enabled: true,
        scope: {},
        rules: [{ name: 'deny', effect: 'deny', match: {} }],
      })

      registry.register({
        name: 'test',
        priority: 10,
        enabled: true,
        scope: {},
        rules: [{ name: 'allow', effect: 'allow', match: {} }],
      })

      const all = registry.getAll()
      expect(all).toHaveLength(1)
      expect(all[0]!.rules[0]!.name).toBe('allow')
    })

    it('unregister removes a policy', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'test',
        priority: 10,
        enabled: true,
        scope: {},
        rules: [],
      })
      expect(registry.has('test')).toBe(true)

      const removed = registry.unregister('test')
      expect(removed).toBe(true)
      expect(registry.has('test')).toBe(false)
    })

    it('unregister returns false for non-existent policy', () => {
      const registry = new PermissionPolicyRegistry()
      expect(registry.unregister('nope')).toBe(false)
    })
  })

  describe('#getEffective', () => {
    it('filters policies by agent name', () => {
      const registry = new PermissionPolicyRegistry()

      registry.register({
        name: 'global',
        priority: 10,
        enabled: true,
        scope: { agents: ['*'] },
        rules: [],
      })
      registry.register({
        name: 'coder-only',
        priority: 20,
        enabled: true,
        scope: { agents: ['coder'] },
        rules: [],
      })

      const effective = registry.getEffective('lead')
      expect(effective.map(p => p.name)).toEqual(['global'])
    })
  })
})

// ═══ Built-in Policies ═══

describe('Built-in Policies', () => {
  describe('FILE_GUARD_POLICY', () => {
    it('denies writing to protected paths', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(FILE_GUARD_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'write',
        filePath: '/etc/passwd',
      }))
      expect(decision.effect).toBe('deny')
    })

    it('denies writing to node_modules', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(FILE_GUARD_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'edit',
        filePath: '/project/node_modules/pkg/index.js',
      }))
      expect(decision.effect).toBe('deny')
    })

    it('allows writing to normal paths', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(FILE_GUARD_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'write',
        filePath: '/project/src/app.ts',
      }))
      expect(decision.effect).toBe('allow')
    })

    it('allows read tools on protected paths', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(FILE_GUARD_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'read',
        filePath: '/etc/hosts',
      }))
      expect(decision.effect).toBe('allow')
    })
  })

  describe('DESTRUCTIVE_COMMAND_POLICY', () => {
    it('asks confirmation for rm -rf', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(DESTRUCTIVE_COMMAND_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'bash',
        args: { command: 'rm -rf /tmp/build' },
      }))
      expect(decision.effect).toBe('ask')
    })

    it('asks confirmation for git push --force', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(DESTRUCTIVE_COMMAND_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'bash',
        args: { command: 'git push --force origin main' },
      }))
      expect(decision.effect).toBe('ask')
    })

    it('allows normal bash commands', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(DESTRUCTIVE_COMMAND_POLICY)

      const decision = registry.evaluate(makeContext({
        toolName: 'bash',
        args: { command: 'ls -la' },
      }))
      expect(decision.effect).toBe('allow')
    })
  })

  describe('createDirectoryFreezePolicy', () => {
    it('allows edits within the frozen directory', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createDirectoryFreezePolicy('/project/src'))

      const decision = registry.evaluate(makeContext({
        toolName: 'edit',
        filePath: '/project/src/index.ts',
      }))
      expect(decision.effect).toBe('allow')
    })

    it('denies edits outside the frozen directory', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createDirectoryFreezePolicy('/project/src'))

      const decision = registry.evaluate(makeContext({
        toolName: 'edit',
        filePath: '/project/tests/app.test.ts',
      }))
      expect(decision.effect).toBe('deny')
    })
  })

  describe('createDisabledToolsPolicy', () => {
    it('denies disabled tools', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createDisabledToolsPolicy(['bash', 'web-search']))

      const bashDecision = registry.evaluate(makeContext({ toolName: 'bash' }))
      expect(bashDecision.effect).toBe('deny')

      const readDecision = registry.evaluate(makeContext({ toolName: 'read' }))
      expect(readDecision.effect).toBe('allow')
    })
  })

  describe('createAgentBoundaryPolicy', () => {
    it('allows declared tools for the agent', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createAgentBoundaryPolicy('web-agent', ['web-search', 'web-fetch', 'read']))

      const decision = registry.evaluate(makeContext({
        agentName: 'web-agent',
        toolName: 'web-search',
      }))
      expect(decision.effect).toBe('allow')
    })

    it('denies undeclared tools for the agent', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createAgentBoundaryPolicy('web-agent', ['web-search', 'web-fetch', 'read']))

      const decision = registry.evaluate(makeContext({
        agentName: 'web-agent',
        toolName: 'write',
      }))
      expect(decision.effect).toBe('deny')
      expect(decision.reason).toContain('web-agent')
    })

    it('does not affect other agents', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createAgentBoundaryPolicy('web-agent', ['web-search']))

      const decision = registry.evaluate(makeContext({
        agentName: 'lead',
        toolName: 'write',
      }))
      expect(decision.effect).toBe('allow')
    })
  })

  describe('createPermissionModePolicy', () => {
    it('bypass mode allows everything', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createPermissionModePolicy('bypass'))

      const decision = registry.evaluate(makeContext({ toolName: 'bash' }))
      expect(decision.effect).toBe('allow')
    })

    it('readonly mode allows reads and denies writes', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createPermissionModePolicy('readonly'))

      const readDecision = registry.evaluate(makeContext({ toolName: 'read' }))
      expect(readDecision.effect).toBe('allow')

      const writeDecision = registry.evaluate(makeContext({ toolName: 'write' }))
      expect(writeDecision.effect).toBe('deny')
    })

    it('confirm mode asks for writes', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createPermissionModePolicy('confirm'))

      const readDecision = registry.evaluate(makeContext({ toolName: 'read' }))
      expect(readDecision.effect).toBe('allow')

      const writeDecision = registry.evaluate(makeContext({ toolName: 'write' }))
      expect(writeDecision.effect).toBe('ask')
    })

    it('strict mode denies unmatched', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createPermissionModePolicy('strict'))

      // strict is priority 9999, so with no other policies it denies
      const decision = registry.evaluate(makeContext({ toolName: 'write' }))
      expect(decision.effect).toBe('deny')
    })

    it('auto mode allows reads and falls through for writes', () => {
      const registry = new PermissionPolicyRegistry()
      registry.register(createPermissionModePolicy('auto'))

      const readDecision = registry.evaluate(makeContext({ toolName: 'read' }))
      expect(readDecision.effect).toBe('allow')

      // write falls through auto mode (no rule matched) → default allow
      const writeDecision = registry.evaluate(makeContext({ toolName: 'write' }))
      expect(writeDecision.effect).toBe('allow')
    })
  })
})

// ═══ PermissionAuditLog ═══

describe('PermissionAuditLog', () => {
  it('records and retrieves entries', () => {
    const log = new PermissionAuditLog()
    const ctx = makeContext({ toolName: 'write', sessionId: 'sess-1' })

    log.record(ctx, {
      effect: 'deny',
      policyName: 'test',
      ruleName: 'r1',
      timestamp: Date.now(),
      evaluatedPolicies: 1,
    })

    expect(log.size).toBe(1)
    expect(log.getDenyCount('sess-1')).toBe(1)
    expect(log.getDenyCount('sess-other')).toBe(0)
  })

  it('filters by session and effect', () => {
    const log = new PermissionAuditLog()

    log.record(makeContext({ sessionId: 'a' }), {
      effect: 'allow', policyName: 'p', ruleName: 'r', timestamp: 1, evaluatedPolicies: 1,
    })
    log.record(makeContext({ sessionId: 'a' }), {
      effect: 'deny', policyName: 'p', ruleName: 'r', timestamp: 2, evaluatedPolicies: 1,
    })
    log.record(makeContext({ sessionId: 'b' }), {
      effect: 'deny', policyName: 'p', ruleName: 'r', timestamp: 3, evaluatedPolicies: 1,
    })

    expect(log.getEntries({ sessionId: 'a' })).toHaveLength(2)
    expect(log.getEntries({ effect: 'deny' })).toHaveLength(2)
    expect(log.getEntries({ sessionId: 'a', effect: 'deny' })).toHaveLength(1)
  })

  it('clears by session', () => {
    const log = new PermissionAuditLog()

    log.record(makeContext({ sessionId: 'a' }), {
      effect: 'allow', policyName: 'p', ruleName: 'r', timestamp: 1, evaluatedPolicies: 1,
    })
    log.record(makeContext({ sessionId: 'b' }), {
      effect: 'deny', policyName: 'p', ruleName: 'r', timestamp: 2, evaluatedPolicies: 1,
    })

    log.clear('a')
    expect(log.size).toBe(1)
    expect(log.getEntries({ sessionId: 'a' })).toHaveLength(0)
  })

  it('enforces max entry limit', () => {
    const log = new PermissionAuditLog(5)

    for (let i = 0; i < 10; i++) {
      log.record(makeContext(), {
        effect: 'allow', policyName: 'p', ruleName: 'r', timestamp: i, evaluatedPolicies: 1,
      })
    }

    expect(log.size).toBe(5)
  })
})

// ═══ compilePolicyFromSetting ═══

describe('compilePolicyFromSetting', () => {
  it('compiles config into PermissionPolicy', () => {
    const config: PermissionPolicySetting = {
      name: 'user-policy',
      priority: 25,
      rules: [
        { name: 'deny-bash', effect: 'deny', tools: ['bash'], deny_reason: 'No shell' },
        { name: 'allow-rest', effect: 'allow' },
      ],
    }

    const policy = compilePolicyFromSetting(config)
    expect(policy.name).toBe('user-policy')
    expect(policy.priority).toBe(25)
    expect(policy.enabled).toBe(true)
    expect(policy.rules).toHaveLength(2)
    expect(policy.rules[0]!.match.tools).toEqual(['bash'])
    expect(policy.rules[0]!.denyReason).toBe('No shell')
  })

  it('compiles path strings into RegExp[]', () => {
    const config: PermissionPolicySetting = {
      name: 'path-policy',
      rules: [
        { name: 'deny-configs', effect: 'deny', paths: ['\\.config\\.'] },
      ],
    }

    const policy = compilePolicyFromSetting(config)
    const pathPatterns = policy.rules[0]!.match.paths!
    expect(pathPatterns).toHaveLength(1)
    expect(pathPatterns[0]!.test('project.config.json')).toBe(true)
  })

  it('uses defaults for optional fields', () => {
    const config: PermissionPolicySetting = {
      name: 'minimal',
      rules: [{ name: 'r', effect: 'allow' }],
    }

    const policy = compilePolicyFromSetting(config)
    expect(policy.priority).toBe(50)
    expect(policy.enabled).toBe(true)
  })
})

// ═══ createPermissionGuardHook ═══

describe('createPermissionGuardHook', () => {
  it('creates a hook with correct metadata', () => {
    const registry = new PermissionPolicyRegistry()
    const hook = createPermissionGuardHook(registry)

    expect(hook.name).toBe('permission-guard')
    expect(hook.timing).toBe('tool.execute.before')
    expect(hook.priority).toBe(5)
    expect(hook.enabled).toBe(true)
  })

  it('allows tool calls when no policy denies', () => {
    const registry = new PermissionPolicyRegistry()
    const hook = createPermissionGuardHook(registry)

    const input: ToolExecuteBeforeInput = {
      toolName: 'read',
      toolCallId: 'tc-1',
      args: { path: '/project/src/app.ts' },
      agentName: 'lead',
      sessionId: 'sess-1',
    }
    const output: ToolExecuteBeforeOutput = {
      args: { path: '/project/src/app.ts' },
      cancelled: false,
    }

    hook.handle!(input, output)
    expect(output.cancelled).toBe(false)
  })

  it('cancels tool calls when policy denies', () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createDisabledToolsPolicy(['bash']))
    const hook = createPermissionGuardHook(registry)

    const input: ToolExecuteBeforeInput = {
      toolName: 'bash',
      toolCallId: 'tc-1',
      args: { command: 'ls' },
      agentName: 'lead',
      sessionId: 'sess-1',
    }
    const output: ToolExecuteBeforeOutput = {
      args: { command: 'ls' },
      cancelled: false,
    }

    expect(() => hook.handle!(input, output)).toThrow('Permission denied')
    expect(output.cancelled).toBe(true)
  })

  it('records audit log entries', () => {
    const registry = new PermissionPolicyRegistry()
    const auditLog = new PermissionAuditLog()
    const hook = createPermissionGuardHook(registry, auditLog)

    const input: ToolExecuteBeforeInput = {
      toolName: 'read',
      toolCallId: 'tc-1',
      args: {},
      agentName: 'lead',
      sessionId: 'sess-1',
    }
    const output: ToolExecuteBeforeOutput = {
      args: {},
      cancelled: false,
    }

    hook.handle!(input, output)
    expect(auditLog.size).toBe(1)
    expect(auditLog.getEntries()[0]!.decision.effect).toBe('allow')
  })

  it('sets cancelReason with [CONFIRM] prefix for ask decisions', () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('confirm'))
    const hook = createPermissionGuardHook(registry)

    const input: ToolExecuteBeforeInput = {
      toolName: 'write',
      toolCallId: 'tc-1',
      args: { path: '/project/foo.ts' },
      agentName: 'lead',
      sessionId: 'sess-1',
    }
    const output: ToolExecuteBeforeOutput = {
      args: { path: '/project/foo.ts' },
      cancelled: false,
    }

    hook.handle!(input, output)
    expect(output.cancelled).toBe(false)
    expect(output.cancelReason).toMatch(/^\[CONFIRM\]/)
  })
})

// ═══ Combined policy evaluation ═══

describe('Combined Policy Scenarios', () => {
  it('permission mode + file guard + destructive guard', () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('auto'))
    registry.register(FILE_GUARD_POLICY)
    registry.register(DESTRUCTIVE_COMMAND_POLICY)

    // Read allowed by auto mode
    const read = registry.evaluate(makeContext({ toolName: 'read' }))
    expect(read.effect).toBe('allow')

    // Write to normal path → falls through auto allow, not blocked by file-guard
    const normalWrite = registry.evaluate(makeContext({
      toolName: 'write',
      filePath: '/project/src/app.ts',
    }))
    expect(normalWrite.effect).toBe('allow')

    // Write to protected path → denied by file-guard
    const protectedWrite = registry.evaluate(makeContext({
      toolName: 'write',
      filePath: '/project/node_modules/pkg/index.js',
    }))
    expect(protectedWrite.effect).toBe('deny')
    expect(protectedWrite.policyName).toBe('builtin::file-guard')

    // Destructive bash → ask
    const destructive = registry.evaluate(makeContext({
      toolName: 'bash',
      args: { command: 'rm -rf /tmp/build' },
    }))
    expect(destructive.effect).toBe('ask')
    expect(destructive.policyName).toBe('builtin::destructive-guard')
  })

  it('agent boundary combined with global policies', () => {
    const registry = new PermissionPolicyRegistry()
    registry.register(createPermissionModePolicy('auto'))
    registry.register(FILE_GUARD_POLICY)
    registry.register(createAgentBoundaryPolicy('searcher', ['web-search', 'read']))

    // searcher can use allowed tools
    const searchAllowed = registry.evaluate(makeContext({
      agentName: 'searcher',
      toolName: 'web-search',
    }))
    expect(searchAllowed.effect).toBe('allow')

    // searcher cannot use undeclared tools
    const searchDenied = registry.evaluate(makeContext({
      agentName: 'searcher',
      toolName: 'write',
    }))
    expect(searchDenied.effect).toBe('deny')

    // other agent can still use write
    const leadWrite = registry.evaluate(makeContext({
      agentName: 'lead',
      toolName: 'write',
      filePath: '/project/src/app.ts',
    }))
    expect(leadWrite.effect).toBe('allow')
  })
})
