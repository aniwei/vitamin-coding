import { describe, expect, it } from 'vitest'
import { MemoryManager } from '../src'
import type { Message } from '@x-mars/ai'

function user(text: string): Message {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
  }
}

function assistantToolCall(name: string, args: Record<string, unknown>): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool_call', id: `call_${name}`, name, arguments: args }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test',
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'tool_use',
  }
}

function toolResult(toolName: string, text: string, details: unknown = {}): Message {
  return {
    role: 'tool_result',
    toolCallId: `call_${toolName}`,
    toolName,
    content: [{ type: 'text', text }],
    details,
    isError: false,
    timestamp: Date.now(),
  }
}

describe('post-compact restoration e2e', () => {
  it('injects deferred tools, files, todos, skills, plan, and MCP state after full compaction', async () => {
    const manager = new MemoryManager({
      summarize: async () => 'summary payload',
      estimateTokens: (text) => Math.max(1, Math.ceil(text.length / 10)),
      model: { contextWindow: 64, maxOutput: 16 },
      compaction: {
        trigger: ['tokens', 1],
        keepRecent: ['tokens', 1],
        reserveTokens: 16,
      },
      prune: {
        trigger: ['tokens', 1_000_000],
      },
      snip: {
        maxOutputChars: 1_000_000,
      },
      timeMicro: {
        ageThresholdMs: 1_000_000,
        minOutputTokens: 1_000_000,
      },
    })
    manager.setActivePlan('VCCG-11 restore plan')
    manager.setMcpServers([
      {
        name: 'repo',
        toolCount: 2,
        resourceCount: 1,
        promptCount: 1,
        toolNames: ['search', 'read'],
      },
    ])

    const messages: Message[] = [
      user('start a long coding task'),
      assistantToolCall('tool_search', { query: 'read edit' }),
      toolResult(
        'tool_search',
        [
          'Found 1 tool(s). Their schemas are now loaded and callable:',
          JSON.stringify({ name: 'notebook_edit', description: 'Edit notebooks' }),
        ].join('\n'),
      ),
      assistantToolCall('read', { path: './src/app.ts' }),
      toolResult('read', 'Read ./src/app.ts'),
      assistantToolCall('edit', { file_path: './src/app.ts' }),
      toolResult('edit', 'Updated ./src/app.ts successfully'),
      assistantToolCall('write_todos', {
        action: 'set',
        todos: [{ id: 'R1', title: 'restore compact state', status: 'in_progress' }],
      }),
      toolResult('write_todos', '[in_progress] R1: restore compact state'),
      assistantToolCall('skill_execute', { skillName: 'rfc-to-todos' }),
      toolResult('skill_execute', 'executed skill: rfc-to-todos'),
      toolResult('mcp__repo__search', 'Found symbol in MCP repo server'),
      user('continue after compact'),
    ]

    const result = await manager.process(messages, 'session-post-compact')

    expect(result.compacted).toBe(true)
    expect(result.messages[0]).toMatchObject({ role: 'user' })
    expect(result.messages[1]).toMatchObject({ role: 'user' })
    expect(result.messages.at(-1)).toEqual(messages.at(-1))

    const restoration = result.messages[1] ? JSON.stringify(result.messages[1]) : ''
    expect(restoration).toContain('[Post-compaction state restoration]')
    expect(restoration).toContain('./src/app.ts')
    expect(restoration).toContain('notebook_edit')
    expect(restoration).toContain('rfc-to-todos')
    expect(restoration).toContain('VCCG-11 restore plan')
    expect(restoration).toContain('R1: restore compact state')
    expect(restoration).toContain('repo (2 tools, 1 resources)')
    expect(restoration).toContain('search')
    expect(restoration).toContain('read')
  })
})
