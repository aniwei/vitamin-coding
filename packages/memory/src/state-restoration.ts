import {
  MEMORY_TOOL_READ,
  MEMORY_TOOL_GREP,
  MEMORY_TOOL_FIND,
  MEMORY_TOOL_LS,
  MEMORY_TOOL_WRITE,
  MEMORY_TOOL_EDIT,
  MEMORY_TOOL_APPLY_PATCH,
  MEMORY_TOOL_CREATE_FILE,
  MEMORY_TOOL_EDIT_NOTEBOOK_FILE,
  MEMORY_LEGACY_TOOL_READ_FILE,
  MEMORY_LEGACY_TOOL_GREP_SEARCH,
  MEMORY_LEGACY_TOOL_FILE_SEARCH,
  MEMORY_LEGACY_TOOL_WRITE_FILE,
  MEMORY_LEGACY_TOOL_EDIT_FILE,
  MEMORY_LEGACY_TOOL_REPLACE_STRING_IN_FILE,
} from '@vitamin/env'
import { messageToText } from './token-estimator'
import type { Message } from '@vitamin/ai'

export interface RestorationFile {
  path: string
  action: 'read' | 'modified'
}

export interface McpServerSnapshot {
  name: string
  toolCount: number
  resourceCount: number
  promptCount: number
  toolNames: string[]
}

export interface RestorationTodo {
  id: string
  title: string
  status: string
}

export interface RestorationState {
  recentFiles: RestorationFile[]
  activePlan: string | null
  activeTodos: RestorationTodo[]
  invokedSkills: string[]
  loadedDeferredTools: string[]
  asyncAgents: string[]
  mcpServers: McpServerSnapshot[]
}

const readTools = new Set([
  MEMORY_TOOL_READ,
  MEMORY_TOOL_GREP,
  MEMORY_TOOL_FIND,
  MEMORY_TOOL_LS,
  MEMORY_LEGACY_TOOL_READ_FILE,
  MEMORY_LEGACY_TOOL_GREP_SEARCH,
  MEMORY_LEGACY_TOOL_FILE_SEARCH,
])

const modifyTools = new Set([
  MEMORY_TOOL_WRITE,
  MEMORY_TOOL_EDIT,
  MEMORY_TOOL_APPLY_PATCH,
  MEMORY_TOOL_CREATE_FILE,
  MEMORY_TOOL_EDIT_NOTEBOOK_FILE,
  MEMORY_LEGACY_TOOL_WRITE_FILE,
  MEMORY_LEGACY_TOOL_EDIT_FILE,
  MEMORY_LEGACY_TOOL_REPLACE_STRING_IN_FILE,
])

export function collectRestorationState(messages: readonly Message[]): RestorationState {
  const seen = new Map<string, 'read' | 'modified'>()
  const invokedSkills = new Set<string>()
  const loadedDeferredTools = new Set<string>()
  const asyncAgents = new Set<string>()
  const activeTodos = new Map<string, RestorationTodo>()
  const mcpToolNames = new Map<string, Set<string>>() // serverName → toolNames

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      for (const part of msg.content) {
        if (part.type !== 'tool_call') {
          continue
        }

        if (isSkillTool(part.name)) {
          for (const name of extractSkillNamesFromArgs(part.arguments)) {
            invokedSkills.add(name)
          }
        }

        if (part.name === 'write_todos') {
          for (const todo of extractTodosFromArgs(part.arguments)) {
            activeTodos.set(todo.id, todo)
          }
        }

        const action = toolAction(part.name)
        if (!action) {
          continue
        }

        for (const path of extractPathsFromArgs(part.arguments)) {
          markFile(seen, path, action)
        }
      }
    }

    if (msg.role === 'tool_result') {
      const toolName = msg.toolName
      const content = messageToText(msg)
      const action = toolAction(toolName)

      if (action) {
        for (const path of extractPathsFromText(content)) {
          markFile(seen, path, action)
        }
      }

      // Detect tool_search results — extract loaded deferred tool names
      if (toolName === 'tool_search') {
        for (const name of extractLoadedToolNames(content)) {
          loadedDeferredTools.add(name)
        }
      }

      // Detect skill invocations
      if (isSkillTool(toolName)) {
        for (const name of extractSkillNamesFromText(content)) {
          invokedSkills.add(name)
        }
      }

      if (toolName === 'write_todos') {
        for (const todo of extractTodosFromDetails(msg.details)) {
          activeTodos.set(todo.id, todo)
        }
        for (const todo of extractTodosFromText(content)) {
          activeTodos.set(todo.id, todo)
        }
      }

      // Detect agent/task creation
      if (toolName === 'task' || toolName === 'task_create') {
        const idMatch = content.match(/(?:task|agent)[_\s]?id[:\s]+(\S+)/i)
        if (idMatch?.[1]) {
          asyncAgents.add(idMatch[1])
        }
      }

      // Detect MCP tool usage: mcp__<server>__<tool>
      const mcpMatch = toolName.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/)
      const serverName = mcpMatch?.[1]
      const subToolName = mcpMatch?.[2]
      if (serverName && subToolName) {
        if (!mcpToolNames.has(serverName)) {
          mcpToolNames.set(serverName, new Set())
        }
        const toolNames = mcpToolNames.get(serverName)
        if (toolNames) {
          toolNames.add(subToolName)
        }
      }
    }

    // Detect plan creation/update from assistant messages
    if (msg.role === 'assistant') {
      const text = messageToText(msg)
      if (text.includes('EnterPlanMode') || text.includes('ExitPlanMode')) {
        const planMatch = text.match(/(?:plan|Plan)[:\s]+["']?(\S+?)["']?(?:\s|$)/)
        if (planMatch?.[1]) {
          // populated externally via setActivePlan
        }
      }
    }
  }

  const mcpServers: McpServerSnapshot[] = [...mcpToolNames.entries()].map(([name, tools]) => ({
    name,
    toolCount: tools.size,
    resourceCount: 0,
    promptCount: 0,
    toolNames: [...tools],
  }))

  return {
    recentFiles: Array.from(seen, ([path, action]) => ({ path, action })),
    activePlan: null, // populated externally via setActivePlan
    activeTodos: [...activeTodos.values()],
    invokedSkills: [...invokedSkills],
    loadedDeferredTools: [...loadedDeferredTools],
    asyncAgents: [...asyncAgents],
    mcpServers,
  }
}

function toolAction(toolName: string): 'read' | 'modified' | null {
  if (modifyTools.has(toolName)) {
    return 'modified'
  }
  if (readTools.has(toolName)) {
    return 'read'
  }
  return null
}

function markFile(
  seen: Map<string, 'read' | 'modified'>,
  path: string,
  action: 'read' | 'modified',
): void {
  if (action === 'modified') {
    seen.set(path, 'modified')
    return
  }
  if (!seen.has(path)) {
    seen.set(path, 'read')
  }
}

function extractPathsFromArgs(args: Record<string, unknown>): string[] {
  const paths: string[] = []
  const pathKeys = new Set([
    'path',
    'file',
    'filePath',
    'file_path',
    'filename',
    'targetPath',
    'target_path',
    'cwd',
    'dir',
    'directory',
    'oldPath',
    'old_path',
    'newPath',
    'new_path',
    'outputPath',
    'output_path',
  ])

  function visit(value: unknown, key?: string): void {
    if (typeof value === 'string') {
      if (key && pathKeys.has(key) && looksLikePath(value)) {
        paths.push(value)
      }
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item)
      }
      return
    }

    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        visit(childValue, childKey)
      }
    }
  }

  visit(args)
  return [...new Set(paths)]
}

function extractPathsFromText(text: string): string[] {
  const matches = text.matchAll(/(?:^|[\s("'`])((?:\/|\.\.?\/)[^\s)"'`,]+)/g)
  return [
    ...new Set(
      [...matches]
        .map((m) => m[1])
        .filter((path): path is string => Boolean(path))
        .filter(looksLikePath),
    ),
  ]
}

function looksLikePath(value: string): boolean {
  const trimmed = value.trim()
  return (
    (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) &&
    trimmed.length > 1 &&
    !/\s/.test(trimmed)
  )
}

function extractLoadedToolNames(text: string): string[] {
  const names = new Set<string>()

  for (const objectText of extractJsonObjects(text)) {
    try {
      const parsed = JSON.parse(objectText) as { name?: unknown }
      if (typeof parsed.name === 'string' && parsed.name) {
        names.add(parsed.name)
      }
    } catch {
      // Ignore malformed fragments; tool_search still returns human-readable text.
    }
  }

  return [...names]
}

function isSkillTool(toolName: string): boolean {
  return toolName === 'skill' || toolName.startsWith('skill_')
}

function extractSkillNamesFromArgs(args: Record<string, unknown>): string[] {
  const names = new Set<string>()
  for (const key of ['skillName', 'skill_name', 'name']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      names.add(value.trim())
    }
  }
  return [...names]
}

function extractSkillNamesFromText(text: string): string[] {
  const names = new Set<string>()

  const patterns = [
    /skill(?:Name|_name)?["'\s:=]+([A-Za-z0-9_.-]+)/gi,
    /(?:loaded|executed|created|improved)\s+skill["'\s:]+([A-Za-z0-9_.-]+)/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        names.add(match[1])
      }
    }
  }

  for (const objectText of extractJsonObjects(text)) {
    try {
      const parsed = JSON.parse(objectText) as { skillName?: unknown; skill_name?: unknown; name?: unknown }
      const value = parsed.skillName ?? parsed.skill_name ?? parsed.name
      if (typeof value === 'string' && value.trim()) {
        names.add(value.trim())
      }
    } catch {
      // Ignore malformed fragments.
    }
  }

  return [...names]
}

function extractTodosFromArgs(args: Record<string, unknown>): RestorationTodo[] {
  return extractTodosFromUnknown(args.todos)
}

function extractTodosFromDetails(details: unknown): RestorationTodo[] {
  if (!details || typeof details !== 'object') {
    return []
  }
  return extractTodosFromUnknown((details as Record<string, unknown>).todos)
}

function extractTodosFromUnknown(value: unknown): RestorationTodo[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined
      }
      const record = item as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id : undefined
      const title = typeof record.title === 'string' ? record.title : undefined
      const status = typeof record.status === 'string' ? record.status : 'unknown'
      if (!id || !title) {
        return undefined
      }
      return { id, title, status }
    })
    .filter((todo): todo is RestorationTodo => todo !== undefined)
}

function extractTodosFromText(text: string): RestorationTodo[] {
  const todos: RestorationTodo[] = []
  for (const match of text.matchAll(/\[([^\]]+)\]\s+([A-Za-z0-9_.-]+):\s+(.+)/g)) {
    const status = match[1]
    const id = match[2]
    const title = match[3]
    if (status && id && title) {
      todos.push({ id, title: title.trim(), status })
    }
  }
  return todos
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) {
        start = i
      }
      depth++
      continue
    }

    if (ch === '}' && depth > 0) {
      depth--
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  return objects
}

export function buildRestorationMessage(state: RestorationState): string {
  const parts: string[] = []

  // Plan — highest priority
  if (state.activePlan) {
    parts.push('[Active Plan]')
    parts.push(
      `The current plan "${state.activePlan}" is still active. Continue executing the plan.`,
    )
    parts.push('')
  }

  // File state
  const modified = state.recentFiles.filter((f) => f.action === 'modified')
  const read = state.recentFiles.filter((f) => f.action === 'read')

  if (modified.length > 0 || read.length > 0) {
    parts.push('[File State]')
    if (modified.length > 0) {
      parts.push('Files modified in this session:')
      for (const f of modified) {
        parts.push(`- ${f.path} (modified)`)
      }
    }
    if (read.length > 0) {
      parts.push('Files recently read:')
      for (const f of read) {
        parts.push(`- ${f.path}`)
      }
    }
    parts.push('')
  }

  if (state.activeTodos.length > 0) {
    parts.push('[Active Todos]')
    parts.push('Current todo list:')
    for (const todo of state.activeTodos) {
      parts.push(`- [${todo.status}] ${todo.id}: ${todo.title}`)
    }
    parts.push('')
  }

  // Deferred tools that were loaded — remind the model they are available
  if (state.loadedDeferredTools.length > 0) {
    parts.push('[Loaded Tools]')
    parts.push(
      `The following deferred tools were loaded via tool_search and are available: ${state.loadedDeferredTools.join(', ')}`,
    )
    parts.push('')
  }

  // Invoked skills
  if (state.invokedSkills.length > 0) {
    parts.push('[Invoked Skills]')
    parts.push(`Skills invoked in this session: ${state.invokedSkills.join(', ')}`)
    parts.push('')
  }

  // Async agents
  if (state.asyncAgents.length > 0) {
    parts.push('[Background Agents]')
    parts.push(
      `Background agents still running: ${state.asyncAgents.join(', ')}. Use task_output to check their status.`,
    )
    parts.push('')
  }

  // MCP servers
  if (state.mcpServers.length > 0) {
    parts.push('[MCP Servers]')
    parts.push('The following MCP servers are connected and available:')
    for (const server of state.mcpServers) {
      const toolList = server.toolNames.length > 0 ? ` — tools: ${server.toolNames.join(', ')}` : ''
      parts.push(
        `- ${server.name} (${server.toolCount} tools, ${server.resourceCount} resources)${toolList}`,
      )
    }
    parts.push('Use mcp__<server>__<tool> syntax to call MCP tools.')
    parts.push('')
  }

  if (parts.length === 0) {
    return ''
  }

  return `[Post-compaction state restoration]\n\n${parts.join('\n')}`
}

export function createEmptyRestorationState(): RestorationState {
  return {
    recentFiles: [],
    activePlan: null,
    activeTodos: [],
    invokedSkills: [],
    loadedDeferredTools: [],
    asyncAgents: [],
    mcpServers: [],
  }
}

export function mergeRestorationState(
  existing: RestorationState,
  incoming: RestorationState,
): RestorationState {
  const fileMap = new Map<string, 'read' | 'modified'>()
  for (const f of existing.recentFiles) {
    fileMap.set(f.path, f.action === 'modified' ? 'modified' : f.action)
  }
  for (const f of incoming.recentFiles) {
    const current = fileMap.get(f.path)
    if (current !== 'modified') {
      fileMap.set(f.path, f.action)
    }
  }

  // Merge MCP servers
  const serverMap = new Map<string, McpServerSnapshot>()
  for (const s of existing.mcpServers) {
    serverMap.set(s.name, s)
  }
  for (const s of incoming.mcpServers) {
    const current = serverMap.get(s.name)
    if (current) {
      serverMap.set(s.name, {
        name: s.name,
        toolCount: Math.max(current.toolCount, s.toolCount),
        resourceCount: Math.max(current.resourceCount, s.resourceCount),
        promptCount: Math.max(current.promptCount, s.promptCount),
        toolNames: [...new Set([...current.toolNames, ...s.toolNames])],
      })
    } else {
      serverMap.set(s.name, s)
    }
  }

  return {
    recentFiles: Array.from(fileMap, ([path, action]) => ({ path, action })),
    activePlan: incoming.activePlan ?? existing.activePlan,
    activeTodos: mergeTodos(existing.activeTodos, incoming.activeTodos),
    invokedSkills: [...new Set([...existing.invokedSkills, ...incoming.invokedSkills])],
    loadedDeferredTools: [
      ...new Set([...existing.loadedDeferredTools, ...incoming.loadedDeferredTools]),
    ],
    asyncAgents: [...new Set([...existing.asyncAgents, ...incoming.asyncAgents])],
    mcpServers: [...serverMap.values()],
  }
}

function mergeTodos(
  existing: readonly RestorationTodo[],
  incoming: readonly RestorationTodo[],
): RestorationTodo[] {
  const todoMap = new Map<string, RestorationTodo>()
  for (const todo of existing) {
    todoMap.set(todo.id, todo)
  }
  for (const todo of incoming) {
    todoMap.set(todo.id, todo)
  }
  return [...todoMap.values()]
}
