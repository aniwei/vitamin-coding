import { describe, expect, it } from 'vitest'
import { collectRestorationState, buildRestorationMessage, createEmptyRestorationState } from '../src/state-restoration'
import type { Message } from '@vitamin/ai'

function makeToolResult(toolName: string, text: string, details: unknown = {}): Message {
  return {
    role: 'tool_result',
    toolCallId: `call_${Math.random().toString(36).slice(2, 6)}`,
    toolName,
    content: [{ type: 'text', text }],
    isError: false,
    details,
    timestamp: Date.now(),
  }
}

function makeAssistantToolCall(name: string, args: Record<string, unknown>): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool_call', id: `call_${name}`, name, arguments: args }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'tool_use',
  }
}

describe('collectRestorationState', () => {
  describe('#given messages with file read and modify tools', () => {
    it('#then extracts file paths with correct actions', () => {
      const messages: Message[] = [
        makeToolResult('read', 'Contents of /src/index.ts ...'),
        makeToolResult('edit', 'Updated /src/index.ts successfully'),
        makeToolResult('read', 'Contents of /src/utils.ts ...'),
      ]

      const state = collectRestorationState(messages)

      expect(state.recentFiles).toHaveLength(2)

      const indexFile = state.recentFiles.find((f) => f.path === '/src/index.ts')
      expect(indexFile?.action).toBe('modified')

      const utilsFile = state.recentFiles.find((f) => f.path === '/src/utils.ts')
      expect(utilsFile?.action).toBe('read')
    })
  })

  describe('#given no file tool messages', () => {
    it('#then returns empty recentFiles', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: Date.now() },
      ]

      const state = collectRestorationState(messages)
      expect(state.recentFiles).toHaveLength(0)
    })
  })

  describe('#given modify after read on same file', () => {
    it('#then marks as modified (modify wins)', () => {
      const messages: Message[] = [
        makeToolResult('read', 'Contents of /src/app.ts ...'),
        makeToolResult('write', 'Wrote /src/app.ts successfully'),
      ]

      const state = collectRestorationState(messages)
      const appFile = state.recentFiles.find((f) => f.path === '/src/app.ts')
      expect(appFile?.action).toBe('modified')
    })
  })

  describe('#given tool call arguments with paths', () => {
    it('#then extracts relative, absolute, directory, and extensionless paths from structured args', () => {
      const messages: Message[] = [
        makeAssistantToolCall('read', { path: './src/app.ts' }),
        makeAssistantToolCall('edit', { file_path: '/repo/src/app.ts' }),
        makeAssistantToolCall('read', { directory: './src/components' }),
        makeAssistantToolCall('edit', { oldPath: './Dockerfile', newPath: './Containerfile' }),
      ]

      const state = collectRestorationState(messages)

      expect(state.recentFiles).toContainEqual({ path: './src/app.ts', action: 'read' })
      expect(state.recentFiles).toContainEqual({ path: '/repo/src/app.ts', action: 'modified' })
      expect(state.recentFiles).toContainEqual({ path: './src/components', action: 'read' })
      expect(state.recentFiles).toContainEqual({ path: './Dockerfile', action: 'modified' })
      expect(state.recentFiles).toContainEqual({ path: './Containerfile', action: 'modified' })
    })
  })

  describe('#given tool result text with directory or extensionless paths', () => {
    it('#then extracts conservative path-looking tokens', () => {
      const messages: Message[] = [
        makeToolResult('read', 'Listed ./src/components successfully'),
        makeToolResult('write', 'Wrote /repo/Dockerfile successfully'),
      ]

      const state = collectRestorationState(messages)

      expect(state.recentFiles).toContainEqual({ path: './src/components', action: 'read' })
      expect(state.recentFiles).toContainEqual({ path: '/repo/Dockerfile', action: 'modified' })
    })
  })

  describe('#given tool_search result', () => {
    it('#then extracts only top-level schema names', () => {
      const messages: Message[] = [
        makeToolResult(
          'tool_search',
          [
            'Found 1 tool(s). Their schemas are now loaded and callable:',
            '',
            JSON.stringify(
              {
                name: 'web_search',
                description: 'Search',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                  },
                },
              },
              null,
              2,
            ),
          ].join('\n'),
        ),
      ]

      const state = collectRestorationState(messages)

      expect(state.loadedDeferredTools).toEqual(['web_search'])
    })
  })

  describe('#given skill and todo tool activity', () => {
    it('#then extracts invoked skills and active todos', () => {
      const messages: Message[] = [
        makeAssistantToolCall('skill_execute', { skillName: 'rfc-to-todos' }),
        makeToolResult('skill_execute', 'executed skill: rfc-to-todos'),
        makeAssistantToolCall('write_todos', {
          action: 'set',
          todos: [{ id: 'T1', title: 'verify restore', status: 'in_progress' }],
        }),
        makeToolResult(
          'write_todos',
          '[done] T2: keep compact context',
          { todos: [{ id: 'T1', title: 'verify restore', status: 'done' }] },
        ),
      ]

      const state = collectRestorationState(messages)

      expect(state.invokedSkills).toEqual(['rfc-to-todos'])
      expect(state.activeTodos).toContainEqual({
        id: 'T1',
        title: 'verify restore',
        status: 'done',
      })
      expect(state.activeTodos).toContainEqual({
        id: 'T2',
        title: 'keep compact context',
        status: 'done',
      })
    })
  })
})

describe('buildRestorationMessage', () => {
  describe('#given non-empty restoration state', () => {
    it('#then builds formatted message', () => {
      const state = {
        ...createEmptyRestorationState(),
        recentFiles: [
          { path: '/src/a.ts', action: 'modified' as const },
          { path: '/src/b.ts', action: 'read' as const },
        ],
      }

      const message = buildRestorationMessage(state)

      expect(message).toContain('[Post-compaction state restoration]')
      expect(message).toContain('/src/a.ts')
      expect(message).toContain('/src/b.ts')
      expect(message).toContain('Files modified')
      expect(message).toContain('Files recently read')
    })
  })

  describe('#given empty restoration state', () => {
    it('#then returns empty string', () => {
      const message = buildRestorationMessage(createEmptyRestorationState())
      expect(message).toBe('')
    })
  })
})
