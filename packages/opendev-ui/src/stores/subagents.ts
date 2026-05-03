import { isRecord, readNumber, readObject, readString } from '@x-mars/shared/browser/data'
import { create } from 'zustand'
import { ws } from '../api/websocket'

export interface ActiveToolCall {
  toolName: string
  toolId: string
  args: Record<string, unknown>
  startedAt: number // Date.now() 时间戳
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
  // 用于显示的 subagent ID 有序列表
  order: string[]
}

export const useSubagentStore = create<SubagentStore>(() => ({
  subagents: new Map(),
  order: [],
}))

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
  if (!isRecord(message.data)) {
    return
  }
  const d = message.data

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
    // 新批次开始时清除所有已完成的 subagent
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
  if (!isRecord(message.data)) {
    return
  }
  const d = message.data

  // 尝试找到此工具属于哪个 subagent
  const state = useSubagentStore.getState()
  const subagentId = readString(d, 'subagentId', 'parentSubagentId')

  if (subagentId && state.subagents.has(subagentId)) {
    const toolId =
      readString(d, 'toolCallId', 'toolId') ||
      `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    useSubagentStore.setState((prev) => {
      const subagents = new Map(prev.subagents)
      const sa = subagents.get(subagentId)
      if (!sa || sa.finished) {
        return {}
      }

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
  if (!isRecord(message.data)) {
    return
  }
  const d = message.data

  const subagentId = readString(d, 'subagentId', 'parentSubagentId')

  if (subagentId) {
    useSubagentStore.setState((prev) => {
      const subagents = new Map(prev.subagents)
      const sa = subagents.get(subagentId)
      if (!sa) {
        return {}
      }

      const activeTools = new Map(sa.activeTools)
      const toolId = readString(d, 'toolCallId', 'toolId')

      // 通过 tool id 或工具名匹配查找
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
        if (!tc) {
          return { subagents }
        }
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
        // 最多保留 50 条记录
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
  if (!isRecord(message.data)) {
    return
  }
  const d = message.data

  const id = readString(d, 'subagentId', 'toolCallId')
  if (!id) {
    return
  }

  useSubagentStore.setState((prev) => {
    const subagents = new Map(prev.subagents)

    // 先按 subagent id 查找，再按 tool call id 查找
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
    if (!sa) {
      return {}
    }

    subagents.set(matchedId, {
      ...sa,
      finished: true,
      success: d.success !== false,
      resultSummary:
        readString(d, 'resultSummary', 'summary') || (d.success !== false ? 'Completed' : 'Failed'),
      toolCallCount: readNumber(d, 'toolCallCount') || sa.toolCallCount,
      shallowWarning: readString(d, 'shallowWarning') || null,
      activeTools: new Map(),
      completedTools: [],
    })

    return { subagents }
  })
})

// Token 用量更新（如果后端发送）
ws.on('Session.statusUpdate', (message) => {
  if (!isRecord(message.data)) {
    return
  }
  const d = message.data
  const subagentId = readString(d, 'subagentId')
  const tokenCount = readNumber(d, 'tokenCount')
  if (!subagentId || tokenCount == null) {
    return
  }

  useSubagentStore.setState((prev) => {
    const subagents = new Map(prev.subagents)
    const sa = subagents.get(subagentId)
    if (!sa) {
      return {}
    }

    subagents.set(subagentId, {
      ...sa,
      tokenCount,
    })
    return { subagents }
  })
})
