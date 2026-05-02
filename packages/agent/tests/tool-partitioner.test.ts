import { describe, expect, it } from 'vitest'
import { partitionToolCalls } from '../src/tool-partitioner'
import type { ToolCall } from '@vitamin/ai'
import type { AgentTool } from '../src/types'
import { z } from 'zod'

function makeToolCall(name: string, id?: string): ToolCall {
  return {
    type: 'tool_call',
    id: id ?? `call_${name}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    arguments: {},
  }
}

function makeTool(
  name: string,
  readonly?: boolean | ((params: unknown) => boolean),
  overrides: Partial<AgentTool> = {},
): AgentTool {
  return {
    name,
    description: `${name} tool`,
    parameters: z.object({}),
    readonly,
    execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
    ...overrides,
  }
}

describe('partitionToolCalls', () => {
  describe('#given [Read, Read, Write, Read]', () => {
    it('#then produces 3 batches: parallel(Read,Read), serial(Write), parallel(Read)', () => {
      const toolCalls = [
        makeToolCall('Read'),
        makeToolCall('Read'),
        makeToolCall('Write'),
        makeToolCall('Read'),
      ]
      const tools = [makeTool('Read', true), makeTool('Write', false)]

      const batches = partitionToolCalls(toolCalls, tools)

      expect(batches).toHaveLength(3)
      expect(batches[0]!.isConcurrencySafe).toBe(true)
      expect(batches[0]!.toolCalls).toHaveLength(2)
      expect(batches[1]!.isConcurrencySafe).toBe(false)
      expect(batches[1]!.toolCalls).toHaveLength(1)
      expect(batches[1]!.toolCalls[0]!.name).toBe('Write')
      expect(batches[2]!.isConcurrencySafe).toBe(true)
      expect(batches[2]!.toolCalls).toHaveLength(1)
      expect(batches[2]!.toolCalls[0]!.name).toBe('Read')
    })
  })

  describe('#given [Write, Write]', () => {
    it('#then produces 2 serial batches', () => {
      const toolCalls = [makeToolCall('Write'), makeToolCall('Write')]
      const tools = [makeTool('Write', false)]

      const batches = partitionToolCalls(toolCalls, tools)

      expect(batches).toHaveLength(2)
      expect(batches[0]!.isConcurrencySafe).toBe(false)
      expect(batches[1]!.isConcurrencySafe).toBe(false)
    })
  })

  describe('#given [Read, Read, Read]', () => {
    it('#then produces 1 parallel batch', () => {
      const toolCalls = [makeToolCall('Read'), makeToolCall('Read'), makeToolCall('Read')]
      const tools = [makeTool('Read', true)]

      const batches = partitionToolCalls(toolCalls, tools)

      expect(batches).toHaveLength(1)
      expect(batches[0]!.isConcurrencySafe).toBe(true)
      expect(batches[0]!.toolCalls).toHaveLength(3)
    })
  })

  describe('#given an empty tool list', () => {
    it('#then returns empty batches', () => {
      const batches = partitionToolCalls([], [])
      expect(batches).toHaveLength(0)
    })
  })

  describe('#given unknown tool name', () => {
    it('#then treats it as mutation (serial)', () => {
      const toolCalls = [makeToolCall('Unknown')]
      const tools: AgentTool[] = []

      const batches = partitionToolCalls(toolCalls, tools)

      expect(batches).toHaveLength(1)
      expect(batches[0]!.isConcurrencySafe).toBe(false)
    })
  })

  describe('#given dynamic readonly function', () => {
    it('#then resolves readonly from params', () => {
      const bashTool = makeTool('Bash', (params: unknown) => {
        const p = params as { command?: string }
        return /^\s*(ls|cat|head|grep)\b/.test(p.command ?? '')
      })

      const readCall: ToolCall = {
        type: 'tool_call',
        id: 'call_1',
        name: 'Bash',
        arguments: { command: 'ls -la' },
      }
      const writeCall: ToolCall = {
        type: 'tool_call',
        id: 'call_2',
        name: 'Bash',
        arguments: { command: 'rm -rf /tmp/foo' },
      }

      const batches = partitionToolCalls([readCall, writeCall], [bashTool])

      expect(batches).toHaveLength(2)
      expect(batches[0]!.isConcurrencySafe).toBe(true)
      expect(batches[0]!.toolCalls[0]!.id).toBe('call_1')
      expect(batches[1]!.isConcurrencySafe).toBe(false)
      expect(batches[1]!.toolCalls[0]!.id).toBe('call_2')
    })

    it('#then falls back to serial when readonly function throws', () => {
      const brokenTool = makeTool('Broken', () => {
        throw new Error('parse failure')
      })

      const batches = partitionToolCalls([makeToolCall('Broken')], [brokenTool])

      expect(batches).toHaveLength(1)
      expect(batches[0]!.isConcurrencySafe).toBe(false)
    })
  })

  describe('#given explicit input-sensitive capability functions', () => {
    it('#then isReadOnly takes precedence over legacy readonly', () => {
      const tool = makeTool('maybe_read', false, {
        isReadOnly: (params) => (params as { mode?: string }).mode === 'read',
      })

      const readCall: ToolCall = {
        type: 'tool_call',
        id: 'call_read',
        name: 'maybe_read',
        arguments: { mode: 'read' },
      }

      const batches = partitionToolCalls([readCall], [tool])

      expect(batches).toHaveLength(1)
      expect(batches[0]!.isConcurrencySafe).toBe(true)
    })

    it('#then isConcurrencySafe can keep a readonly call serial', () => {
      const tool = makeTool('snapshot', true, {
        isConcurrencySafe: () => false,
      })

      const batches = partitionToolCalls([makeToolCall('snapshot')], [tool])

      expect(batches).toHaveLength(1)
      expect(batches[0]!.isConcurrencySafe).toBe(false)
    })

    it('#then falls back to serial when isConcurrencySafe throws', () => {
      const tool = makeTool('broken_safe', true, {
        isConcurrencySafe: () => {
          throw new Error('parse failure')
        },
      })

      const batches = partitionToolCalls([makeToolCall('broken_safe')], [tool])

      expect(batches).toHaveLength(1)
      expect(batches[0]!.isConcurrencySafe).toBe(false)
    })
  })
})
