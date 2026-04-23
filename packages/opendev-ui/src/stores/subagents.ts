import { create } from 'zustand'
import { ws } from '../api/websocket'

export interface ActiveToolCall {
  toolName: string
  toolId: string
  args: Record<string, unknown>
  startedAt: number // Date.now()
}

export interface CompletedToolCall {
  toolName: string
  args: Record<string, unknown>
  elapsedMs: number
  success: boolean
}

export interface SubagentState {
  subagentId: string
  name: string
  task: string
  description: string
  startedAt: number
  finished: boolean
  success: boolean
  resultSummary: string
  toolCallCount: number
  activeTools: Map<string, ActiveToolCall>
  completedTools: CompletedToolCall[]
  tokenCount: number
  shallowWarning: string | null
  toolCallId: string | null
}

interface SubagentStore {
  subagents: Map<string, SubagentState>
  // Ordered list of subagent IDs for display
  order: string[]
}

export const useSubagentStore = create<SubagentStore>(() => ({
  subagents: new Map(),
  order: [],
}))

type EventData = Record<string, unknown>

function asEventData(value: unknown): EventData | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as EventData
  }

  return null
}

function readString(data: EventData, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function readNumber(data: EventData, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

function readObject(data: EventData, ...keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }

  return undefined
}

function formatToolVerb(toolName: string): string {
  const map: Record<string, string> = {
    read_file: 'Read',
    write_file: 'Write',
    edit_file: 'Edit',
    search_code: 'Search',
    search: 'Search',
    run_command: 'Bash',
    bash_execute: 'Bash',
    list_files: 'List',
    list_directory: 'List',
    fetch_url: 'Fetch',
    find_symbol: 'Find Symbol',
    web_search: 'Search',
    apply_patch: 'Patch',
    delete_file: 'Delete',
    git: 'Git',
  }
  return (
    map[toolName] ||
    toolName
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  )
}

function formatToolArg(toolName: string, args: Record<string, unknown>): string {
  const keys: Record<string, string[]> = {
    read_file: ['file_path', 'path'],
    write_file: ['file_path', 'path'],
    edit_file: ['file_path', 'path'],
    search_code: ['pattern', 'query'],
    search: ['pattern', 'query'],
    run_command: ['command'],
    bash_execute: ['command'],
    list_files: ['path', 'directory'],
    fetch_url: ['url'],
    web_search: ['query'],
  }
  for (const key of keys[toolName] || Object.keys(args)) {
    if (args[key] && typeof args[key] === 'string') {
      const val = args[key]
      return val.length > 50 ? val.slice(0, 47) + '...' : val
    }
  }
  return ''
}

export { formatToolVerb, formatToolArg }

// ─── WebSocket Event Handlers ───────────────────────────────────────────────

ws.on('Chat.subagentStart', (message) => {
  const d = asEventData(message.data)
  if (!d) return

  const id = readString(d, 'subagentId', 'toolCallId') || `sa-${Date.now()}`
  const name = readString(d, 'agentType', 'subagentName') || 'Agent'
  const task = readString(d, 'task', 'description') || ''

  const sa: SubagentState = {
    subagentId: id,
    name,
    task,
    description: readString(d, 'description') || task,
    startedAt: Date.now(),
    finished: false,
    success: false,
    resultSummary: '',
    toolCallCount: 0,
    activeTools: new Map(),
    completedTools: [],
    tokenCount: 0,
    shallowWarning: null,
    toolCallId: readString(d, 'toolCallId') || null,
  }

  useSubagentStore.setState((state) => {
    const subagents = new Map(state.subagents)
    // Clear all finished subagents when a new batch starts
    const allFinished =
      state.order.length > 0 &&
      state.order.every((sid) => {
        const s = subagents.get(sid)
        return s?.finished
      })
    if (allFinished) {
      subagents.clear()
      return { subagents: new Map([[id, sa]]), order: [id] }
    }

    subagents.set(id, sa)
    return { subagents, order: [...state.order.filter((sid) => subagents.has(sid)), id] }
  })
})

ws.on('Chat.nestedToolCall', (message) => {
  const d = asEventData(message.data)
  if (!d) return

  // Try to find the subagent this tool belongs to
  const state = useSubagentStore.getState()
  const subagentId = readString(d, 'subagentId', 'parentSubagentId')

  if (subagentId && state.subagents.has(subagentId)) {
    const toolId =
      readString(d, 'toolCallId', 'toolId') ||
      `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    useSubagentStore.setState((prev) => {
      const subagents = new Map(prev.subagents)
      const sa = subagents.get(subagentId)
      if (!sa || sa.finished) return {}

      const activeTools = new Map(sa.activeTools)
      activeTools.set(toolId, {
        toolName: readString(d, 'toolName') || 'unknown',
        toolId,
        args: readObject(d, 'arguments', 'toolArgs', 'args') || {},
        startedAt: Date.now(),
      })

      subagents.set(subagentId, {
        ...sa,
        activeTools,
        toolCallCount: sa.toolCallCount + 1,
      })
      return { subagents }
    })
  }
})

ws.on('Chat.nestedToolResult', (message) => {
  const d = asEventData(message.data)
  if (!d) return

  const subagentId = readString(d, 'subagentId', 'parentSubagentId')

  if (subagentId) {
    useSubagentStore.setState((prev) => {
      const subagents = new Map(prev.subagents)
      const sa = subagents.get(subagentId)
      if (!sa) return {}

      const activeTools = new Map(sa.activeTools)
      const toolId = readString(d, 'toolCallId', 'toolId')

      // Find by tool id or by tool name match.
      let matchedId = toolId && activeTools.has(toolId) ? toolId : null
      if (!matchedId) {
        for (const [tid, tc] of activeTools) {
          if (tc.toolName === readString(d, 'toolName')) {
            matchedId = tid
            break
          }
        }
      }

      if (matchedId) {
        const tc = activeTools.get(matchedId)
        if (!tc) return { subagents }
        activeTools.delete(matchedId)
        const completedTools = [
          ...sa.completedTools,
          {
            toolName: tc.toolName,
            args: tc.args,
            elapsedMs: Date.now() - tc.startedAt,
            success: d.success !== false,
          },
        ]
        // Cap at 50
        if (completedTools.length > 50) {
          completedTools.splice(0, completedTools.length - 50)
        }

        subagents.set(subagentId, { ...sa, activeTools, completedTools })
      }

      return { subagents }
    })
  }
})

ws.on('Chat.subagentComplete', (message) => {
  const d = asEventData(message.data)
  if (!d) return

  const id = readString(d, 'subagentId', 'toolCallId')
  if (!id) return

  useSubagentStore.setState((prev) => {
    const subagents = new Map(prev.subagents)

    // Try to find by subagent id first, then by tool call id.
    let sa = subagents.get(id)
    let matchedId = id
    if (!sa) {
      for (const [sid, s] of subagents) {
        if (s.toolCallId === id) {
          sa = s
          matchedId = sid
          break
        }
      }
    }
    if (!sa) return {}

    subagents.set(matchedId, {
      ...sa,
      finished: true,
      success: d.success !== false,
      resultSummary:
        readString(d, 'resultSummary', 'summary') ||
        (d.success !== false ? 'Completed' : 'Failed'),
      toolCallCount: readNumber(d, 'toolCallCount') || sa.toolCallCount,
      shallowWarning: readString(d, 'shallowWarning') || null,
      activeTools: new Map(),
      completedTools: [],
    })

    return { subagents }
  })
})

// Token updates (if backend sends them)
ws.on('Session.statusUpdate', (message) => {
  const d = asEventData(message.data)
  const subagentId = d ? readString(d, 'subagentId') : undefined
  const tokenCount = d ? readNumber(d, 'tokenCount') : undefined
  if (!subagentId || tokenCount == null) return

  useSubagentStore.setState((prev) => {
    const subagents = new Map(prev.subagents)
    const sa = subagents.get(subagentId)
    if (!sa) return {}

    subagents.set(subagentId, {
      ...sa,
      tokenCount,
    })
    return { subagents }
  })
})
