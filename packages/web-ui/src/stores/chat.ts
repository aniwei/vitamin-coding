import { create } from 'zustand'
import { api } from '../api/client'
import { ws } from '../api/websocket'
import type {
  ApprovalRequest,
  AskUserRequest,
  Message,
  PerSessionState,
  PlanApprovalRequest,
  StatusInfo,
  ToolCallInfo,
} from '../types'
import { useToastStore } from './toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_SESSION: PerSessionState = {
  messages: [],
  isLoading: false,
  error: null,
  pendingApproval: null,
  pendingAskUser: null,
  pendingPlanApproval: null,
  progressMessage: null,
  queuedMessages: [],
}

function getSessionState(states: Record<string, PerSessionState>, id: string): PerSessionState {
  return states[id] ?? DEFAULT_SESSION
}

function patchSession(
  state: ChatState,
  sessionId: string,
  patch: Partial<PerSessionState> | ((prev: PerSessionState) => Partial<PerSessionState>),
): { sessionStates: Record<string, PerSessionState> } {
  const prev = getSessionState(state.sessionStates, sessionId)
  const updates = typeof patch === 'function' ? patch(prev) : patch
  return {
    sessionStates: {
      ...state.sessionStates,
      [sessionId]: { ...prev, ...updates },
    },
  }
}

type WSData = Record<string, unknown>

function asObject(value: unknown): WSData | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as WSData
  }

  return null
}

function readString(data: WSData, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function readBoolean(data: WSData, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'boolean') {
      return value
    }
  }

  return undefined
}

function readNumber(data: WSData, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return undefined
}

function normalizeApprovalRequest(data: WSData): ApprovalRequest {
  const toolName = readString(data, 'tool_name', 'name') ?? 'tool'
  const command = readString(data, 'command')

  return {
    id: readString(data, 'id', 'approval_id') ?? '',
    tool_name: toolName,
    arguments: asObject(data.arguments) ?? {},
    description: readString(data, 'description') ?? command ?? `Run ${toolName}`,
    preview: readString(data, 'preview') ?? command,
  }
}

function normalizeAskUserOption(option: unknown): { label: string; description?: string } {
  if (typeof option === 'string') {
    return { label: option }
  }

  const data = asObject(option)
  if (!data) {
    return { label: String(option ?? '') }
  }

  return {
    label: readString(data, 'label', 'value') ?? '',
    description: readString(data, 'description'),
  }
}

function normalizeAskUserQuestion(question: unknown, index: number) {
  const data = asObject(question)
  if (!data) {
    return {
      question: `Question ${index + 1}`,
      options: [],
      multi_select: false,
    }
  }

  const options = Array.isArray(data.options) ? data.options.map(normalizeAskUserOption) : []

  return {
    header: readString(data, 'header'),
    question: readString(data, 'question', 'prompt') ?? `Question ${index + 1}`,
    options,
    multi_select: readBoolean(data, 'multi_select', 'multiSelect') ?? false,
  }
}

function normalizeAskUserRequest(data: WSData): AskUserRequest {
  const request_id = readString(data, 'request_id', 'requestId') ?? ''
  const rawQuestions = Array.isArray(data.questions) ? data.questions : null

  if (rawQuestions && rawQuestions.length > 0) {
    return {
      request_id,
      questions: rawQuestions.map((question, index) => normalizeAskUserQuestion(question, index)),
    }
  }

  const options = Array.isArray(data.options) ? data.options.map(normalizeAskUserOption) : []
  const defaultOption = readString(data, 'default')

  if (defaultOption && !options.some((option) => option.label === defaultOption)) {
    options.push({ label: defaultOption })
  }

  return {
    request_id,
    questions: [
      {
        header: readString(data, 'header'),
        question: readString(data, 'question') ?? 'Question',
        options,
        multi_select: readBoolean(data, 'multi_select', 'multiSelect') ?? false,
      },
    ],
  }
}

function normalizePlanApprovalRequest(data: WSData): PlanApprovalRequest {
  return {
    request_id: readString(data, 'request_id', 'requestId') ?? '',
    plan_content: readString(data, 'plan_content', 'planContent', 'content') ?? '',
  }
}

function normalizeStatusInfo(data: WSData, previous: StatusInfo | null): StatusInfo {
  const mode = readString(data, 'mode')
  const autonomy = readString(data, 'autonomy_level')
  const thinking = readString(data, 'thinking_level')

  return {
    mode: mode === 'plan' || mode === 'normal' ? mode : previous?.mode ?? 'normal',
    autonomy_level:
      autonomy === 'Manual' || autonomy === 'Semi-Auto' || autonomy === 'Auto'
        ? autonomy
        : previous?.autonomy_level ?? 'Manual',
    thinking_level:
      thinking === 'Off' || thinking === 'Low' || thinking === 'Medium' || thinking === 'High'
        ? thinking
        : previous?.thinking_level,
    model: readString(data, 'model') ?? previous?.model,
    model_provider: readString(data, 'model_provider', 'provider') ?? previous?.model_provider,
    working_dir:
      readString(data, 'working_dir', 'working_directory', 'workingDirectory') ??
      previous?.working_dir,
    git_branch: readString(data, 'git_branch') ?? previous?.git_branch ?? null,
    session_cost:
      readNumber(data, 'session_cost', 'session_cost_usd') ?? previous?.session_cost,
    context_usage_pct: readNumber(data, 'context_usage_pct') ?? previous?.context_usage_pct,
  }
}

function resolveRunningState(data: WSData): boolean | null {
  const running = readBoolean(data, 'running')
  if (running !== undefined) {
    return running
  }

  const status = readString(data, 'status', 'action')
  if (!status) {
    return null
  }

  if (['running', 'streaming', 'started', 'resumed'].includes(status)) {
    return true
  }

  if (['complete', 'completed', 'finished', 'idle', 'stopped', 'error'].includes(status)) {
    return false
  }

  return null
}

/** Recursively expand tool calls (including nested) into flat message list. */
function expandToolCalls(
  toolCalls: ToolCallInfo[],
  timestamp: string | undefined,
  depth = 0,
): Message[] {
  const messages: Message[] = []
  for (const tc of toolCalls) {
    const toolResult = tc.error ? { success: false, error: tc.error } : (tc.result ?? '')
    messages.push({
      role: 'tool_call',
      content: `Calling ${tc.name}`,
      tool_call_id: tc.id,
      tool_name: tc.name,
      tool_args: tc.parameters,
      tool_args_display: undefined,
      tool_result: toolResult,
      tool_summary: tc.result_summary || null,
      tool_success: !tc.error,
      tool_error: tc.error || null,
      timestamp,
      depth: depth > 0 ? depth : undefined,
    })
    // Recurse into nested tool calls
    if (tc.nested_tool_calls && tc.nested_tool_calls.length > 0) {
      messages.push(...expandToolCalls(tc.nested_tool_calls, timestamp, depth + 1))
    }
  }
  return messages
}

/** Expand raw API messages (with tool_calls arrays) into flat message list. */
function expandMessages(rawMessages: Message[]): Message[] {
  const expanded: Message[] = []
  for (const msg of rawMessages) {
    // Emit thinking traces before content (matches TUI hydration order)
    if (msg.thinking_trace && msg.thinking_trace.trim()) {
      expanded.push({
        role: 'thinking',
        content: msg.thinking_trace,
        metadata: { level: 'Medium' },
        timestamp: msg.timestamp,
      })
    }
    if (msg.reasoning_content && msg.reasoning_content.trim()) {
      expanded.push({
        role: 'thinking',
        content: msg.reasoning_content,
        metadata: { level: 'Medium' },
        timestamp: msg.timestamp,
      })
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      if (msg.content && msg.content.trim()) {
        expanded.push({
          role: msg.role as Message['role'],
          content: msg.content,
          timestamp: msg.timestamp,
        })
      }
      expanded.push(...expandToolCalls(msg.tool_calls, msg.timestamp))
    } else {
      if (msg.content && msg.content.trim()) {
        expanded.push({
          role: msg.role as Message['role'],
          content: msg.content,
          timestamp: msg.timestamp,
        })
      }
    }
  }
  return expanded
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface ChatState {
  // Per-session state (the big change)
  sessionStates: Record<string, PerSessionState>

  // Global state
  isConnected: boolean
  currentSessionId: string | null
  hasWorkspace: boolean
  status: StatusInfo | null
  thinkingLevel: 'Off' | 'Low' | 'Medium' | 'High'
  runningSessions: Set<string>
  sessionListVersion: number
  sidebarCollapsed: boolean

  // Actions
  loadSession: (sessionId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  clearChat: () => Promise<void>
  setConnected: (connected: boolean) => void
  respondToApproval: (approvalId: string, approved: boolean, autoApprove?: boolean) => void
  setHasWorkspace: (hasWorkspace: boolean) => void
  setStatus: (status: StatusInfo) => void
  toggleMode: () => void
  cycleAutonomy: () => void
  cycleThinkingLevel: () => void
  respondToAskUser: (requestId: string, answers: Record<string, unknown> | null) => void
  respondToPlanApproval: (requestId: string, action: string, feedback?: string) => void
  sendInterrupt: () => void
  bumpSessionList: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

const AUTONOMY_CYCLE: Array<'Manual' | 'Semi-Auto' | 'Auto'> = ['Manual', 'Semi-Auto', 'Auto']
const THINKING_CYCLE: Array<'Off' | 'Low' | 'Medium' | 'High'> = ['Off', 'Low', 'Medium', 'High']

export const useChatStore = create<ChatState>((set, get) => ({
  sessionStates: {},
  isConnected: false,
  currentSessionId: null,
  hasWorkspace: false,
  status: null,
  thinkingLevel: 'Medium',
  runningSessions: new Set<string>(),
  sessionListVersion: 0,
  sidebarCollapsed: false,

  bumpSessionList: () => set((state) => ({ sessionListVersion: state.sessionListVersion + 1 })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  loadSession: async (sessionId: string) => {
    console.log(`[Frontend] Loading session ${sessionId}`)

    const existing = get().sessionStates[sessionId]
    if (existing && existing.messages.length > 0) {
      // Instant switch — already cached
      console.log(
        `[Frontend] Session ${sessionId} cached (${existing.messages.length} msgs), instant switch`,
      )
      set({ currentSessionId: sessionId, hasWorkspace: true })
    } else {
      // Need to fetch messages
      set((state) => ({
        currentSessionId: sessionId,
        hasWorkspace: true,
        ...patchSession(state, sessionId, { isLoading: true, error: null }),
      }))

      try {
        console.log(`[Frontend] Fetching messages for session ${sessionId}`)
        const rawMessages = await api.getSessionMessages(sessionId)
        const messages = expandMessages(rawMessages)
        console.log(`[Frontend] Loaded ${messages.length} messages for ${sessionId}`)

        set((state) => ({
          ...patchSession(state, sessionId, { messages, isLoading: false }),
        }))
      } catch (error) {
        console.error(`[Frontend] Failed to load session ${sessionId}:`, error)
        set((state) => ({
          ...patchSession(state, sessionId, {
            error: error instanceof Error ? error.message : 'Failed to load session',
            isLoading: false,
          }),
        }))
      }
    }

    // Fire-and-forget: resume on backend for config context
    api.resumeSession(sessionId).catch(() => {})

    // Refresh status after session change
    try {
      const configData = await api.getSetting()
      set({
        thinkingLevel: configData.thinking_level || 'Medium',
        status: {
          mode: configData.mode || 'normal',
          autonomy_level: configData.autonomy_level || 'Manual',
          thinking_level: configData.thinking_level || 'Medium',
          model: configData.model,
          model_provider: configData.model_provider,
          working_dir: configData.working_dir || '',
          git_branch: configData.git_branch,
        },
      })
    } catch {
      /* ignore */
    }

    console.log(`[Frontend] Session ${sessionId} loaded successfully`)
  },

  sendMessage: async (content: string) => {
    const sessionId = get().currentSessionId
    if (!sessionId) return

    const sessionState = getSessionState(get().sessionStates, sessionId)
    const isQueuing = sessionState.isLoading

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    set((state) => ({
      ...patchSession(state, sessionId, (prev) => ({
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
        queuedMessages: isQueuing ? [...prev.queuedMessages, content] : prev.queuedMessages,
      })),
    }))

    try {
      ws.send({
        type: 'query',
        data: { message: content, session_id: sessionId, sessionId },
      })
    } catch (error) {
      set((state) => ({
        ...patchSession(state, sessionId, {
          error: error instanceof Error ? error.message : 'Failed to send message',
          isLoading: false,
        }),
      }))
    }
  },

  clearChat: async () => {
    const sessionId = get().currentSessionId
    try {
      await api.clearChat()
      if (sessionId) {
        set((state) => ({
          ...patchSession(state, sessionId, { messages: [], error: null }),
        }))
      }
    } catch (error) {
      if (sessionId) {
        set((state) => ({
          ...patchSession(state, sessionId, {
            error: error instanceof Error ? error.message : 'Failed to clear chat',
          }),
        }))
      }
    }
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected })
  },

  respondToApproval: (approvalId: string, approved: boolean, autoApprove = false) => {
    ws.send({
      type: 'approve',
      data: {
        approvalId,
        approval_id: approvalId,
        approved,
        autoApprove,
        auto_approve: autoApprove,
      },
    })
    const sessionId = get().currentSessionId
    if (sessionId) {
      set((state) => ({
        ...patchSession(state, sessionId, { pendingApproval: null }),
      }))
    }
  },

  setHasWorkspace: (hasWorkspace: boolean) => {
    set({ hasWorkspace })
  },

  setStatus: (status: StatusInfo) => {
    set({ status })
  },

  toggleMode: () => {
    const { status } = get()
    if (!status) return
    const newMode = status.mode === 'normal' ? 'plan' : 'normal'
    api.setMode(newMode).catch(console.error)
    set({ status: { ...status, mode: newMode } })
  },

  cycleAutonomy: () => {
    const { status } = get()
    if (!status) return
    const currentIdx = AUTONOMY_CYCLE.indexOf(status.autonomy_level)
    const nextLevel = AUTONOMY_CYCLE[(currentIdx + 1) % AUTONOMY_CYCLE.length]
    api.setAutonomy(nextLevel).catch(console.error)
    set({ status: { ...status, autonomy_level: nextLevel } })
  },

  cycleThinkingLevel: () => {
    const { status } = get()
    const currentLevel = (status?.thinking_level || get().thinkingLevel) as
      | 'Off'
      | 'Low'
      | 'Medium'
      | 'High'
      | undefined
    const currentIdx = THINKING_CYCLE.indexOf(currentLevel ?? 'Off')
    const nextLevel = THINKING_CYCLE[(currentIdx + 1) % THINKING_CYCLE.length]
    api.setThinkingLevel(nextLevel).catch(console.error)
    set({
      thinkingLevel: nextLevel,
      status: status ? { ...status, thinking_level: nextLevel } : status,
    })
  },

  respondToAskUser: (requestId: string, answers: Record<string, unknown> | null) => {
    ws.send({
      type: 'ask_user_response',
      data: { requestId, request_id: requestId, answers, cancelled: answers === null },
    })
    const sessionId = get().currentSessionId
    if (sessionId) {
      set((state) => ({
        ...patchSession(state, sessionId, { pendingAskUser: null }),
      }))
    }
  },

  respondToPlanApproval: (requestId: string, action: string, feedback?: string) => {
    ws.send({
      type: 'plan_approval_response',
      data: { requestId, request_id: requestId, action, feedback: feedback || '' },
    })
    const sessionId = get().currentSessionId
    if (sessionId) {
      set((state) => ({
        ...patchSession(state, sessionId, { pendingPlanApproval: null }),
      }))
    }
  },

  sendInterrupt: () => {
    const sessionId = get().currentSessionId
    if (!sessionId) return

    api.interruptTask().catch(console.error)

    set((state) => ({
      ...patchSession(state, sessionId, (prev) => ({
        isLoading: false,
        pendingApproval: null,
        pendingAskUser: null,
        pendingPlanApproval: null,
        messages: markLastToolCallInterrupted(prev.messages),
      })),
    }))
  },
}))

/** Mark the last pending tool_call message as interrupted. */
function markLastToolCallInterrupted(messages: Message[]): Message[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'tool_call' && !messages[i].tool_result) {
      const updated = [...messages]
      updated[i] = {
        ...messages[i],
        tool_result: { success: false, error: 'Interrupted' },
        tool_success: false,
        tool_error: 'Interrupted',
      }
      return updated
    }
  }
  return messages
}

// ─── WebSocket Event Handlers ───────────────────────────────────────────────

/** Resolve the session ID from a WS event, falling back to currentSessionId. */
function resolveSessionId(data: unknown): string | null {
  const payload = asObject(data)
  if (!payload) {
    return useChatStore.getState().currentSessionId
  }

  return (
    readString(payload, 'session_id', 'sessionId') ?? useChatStore.getState().currentSessionId
  )
}

let connectionStableTimer: number | null = null
let wasEverStable = false

ws.on('connected', () => {
  useChatStore.getState().setConnected(true)
  if (wasEverStable) {
    useToastStore.getState().addToast('Reconnected to server', 'success')
  }
  connectionStableTimer = window.setTimeout(() => {
    wasEverStable = true
  }, 2000)
})

ws.on('disconnected', () => {
  useChatStore.getState().setConnected(false)
  if (connectionStableTimer) {
    clearTimeout(connectionStableTimer)
    connectionStableTimer = null
  }
  if (wasEverStable) {
    useToastStore.getState().addToast('Disconnected from server', 'warning')
  }
})

ws.on('user_message', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const content = payload ? readString(payload, 'content', 'message') : undefined
  if (!content) return
  const sessionState = getSessionState(useChatStore.getState().sessionStates, sid)
  const msgs = sessionState.messages
  // Dedup: skip if last user message already has this content (optimistic add from sendMessage)
  const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')
  if (lastUserMsg && lastUserMsg.content === content) return
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, (prev) => ({
      messages: [
        ...prev.messages,
        {
          role: 'user' as const,
          content,
          timestamp: new Date().toISOString(),
        },
      ],
    })),
  }))
})

ws.on('message_start', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { isLoading: true }),
  }))
})

/** Finalize any active thinking block in the session (mark isActive: false). */
function finalizeThinking(msgs: Message[]): Message[] {
  const lastIdx = msgs.length - 1
  if (lastIdx >= 0 && msgs[lastIdx].role === 'thinking' && msgs[lastIdx].metadata?.isActive) {
    const updated = [...msgs]
    updated[lastIdx] = {
      ...msgs[lastIdx],
      metadata: { ...msgs[lastIdx].metadata, isActive: false },
    }
    return updated
  }
  return msgs
}

ws.on('message_chunk', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const chunk = payload ? readString(payload, 'content', 'delta') ?? '' : ''
  console.log('[Frontend] Received message_chunk:', chunk.substring(0, 100))

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = finalizeThinking(sessionState.messages)
    const lastMessage = msgs[msgs.length - 1]

    let newMessages: Message[]
    if (lastMessage && lastMessage.role === 'assistant') {
      newMessages = [
        ...msgs.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + chunk },
      ]
    } else {
      newMessages = [...msgs, { role: 'assistant' as const, content: chunk }]
    }

    return patchSession(state, sid, { messages: newMessages })
  })
})

ws.on('message_complete', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  console.log('[Frontend] Received message_complete')
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { isLoading: false, queuedMessages: [] }),
  }))
})

ws.on('error', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, {
      error: message.data.message,
      isLoading: false,
    }),
  }))
  useToastStore.getState().addToast(message.data.message || 'An error occurred', 'error')
})

ws.on('approval_required', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  console.log('[Frontend] Received approval_required:', message.data)
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, {
      pendingApproval: normalizeApprovalRequest(asObject(message.data) ?? {}),
    }),
  }))
})

ws.on('approval_resolved', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingApproval: null }),
  }))
})

ws.on('tool_call', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return

  const toolName = payload ? readString(payload, 'tool_name', 'name') ?? 'tool' : 'tool'
  const toolCallId = payload ? readString(payload, 'tool_call_id', 'tool_id', 'id') : undefined
  const toolArgs = (payload && asObject(payload.arguments)) ?? {}
  const toolArgsDisplay = payload ? readString(payload, 'arguments_display') : undefined
  const description = payload ? readString(payload, 'description', 'command') : undefined

  const toolCallMessage: Message = {
    role: 'tool_call',
    content: description || `Calling ${toolName}`,
    tool_call_id: toolCallId,
    tool_name: toolName,
    tool_args: toolArgs,
    tool_args_display: toolArgsDisplay || null,
    timestamp: new Date().toISOString(),
  }

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    return patchSession(state, sid, { messages: [...sessionState.messages, toolCallMessage] })
  })
})

ws.on('tool_result', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return

  const callId = payload ? readString(payload, 'tool_call_id', 'tool_id', 'id') : undefined
  const toolName = payload ? readString(payload, 'tool_name', 'name') ?? 'tool' : 'tool'
  const success = payload
    ? readBoolean(payload, 'success') ?? !(readBoolean(payload, 'isError') ?? false)
    : false
  const error = payload ? readString(payload, 'error') : undefined
  const toolResult = payload ? (payload.raw_result ?? payload.output ?? payload.result) : undefined

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'tool_call' && msgs[i].tool_call_id === callId && !msgs[i].tool_result) {
        const updatedMessages = [...msgs]
        updatedMessages[i] = {
          ...msgs[i],
          tool_result: toolResult,
          tool_success: success,
          tool_error: error || null,
        }
        return patchSession(state, sid, { messages: updatedMessages })
      }
    }

    console.warn(`Received tool_result for ${toolName} but no matching tool_call found`)
    return {}
  })
})

ws.on('thinking_block', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const content = payload ? readString(payload, 'content', 'delta') ?? '' : ''
  const action = payload ? readString(payload, 'action') : undefined
  const isBlockStart = payload?.block_start === true || action === 'start'
  const isBlockEnd = action === 'end'
  const level = payload ? readString(payload, 'level') ?? 'Medium' : 'Medium'

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    // If block_start, always create a new thinking message
    if (isBlockStart) {
      return patchSession(state, sid, {
        messages: [
          ...msgs,
          {
            role: 'thinking' as const,
            content: '',
            metadata: { level, isActive: true },
          },
        ],
      })
    }

    // Otherwise, append to the last thinking message if it exists and is active
    const lastIdx = msgs.length - 1
    if (lastIdx >= 0 && msgs[lastIdx].role === 'thinking' && msgs[lastIdx].metadata?.isActive) {
      const updated = [...msgs]
      updated[lastIdx] = {
        ...msgs[lastIdx],
        content: msgs[lastIdx].content + content,
        metadata: {
          ...msgs[lastIdx].metadata,
          level,
          isActive: isBlockEnd ? false : msgs[lastIdx].metadata?.isActive,
        },
      }
      return patchSession(state, sid, { messages: updated })
    }

    // No active thinking block — create one
    return patchSession(state, sid, {
      messages: [
        ...msgs,
        {
          role: 'thinking' as const,
          content,
          metadata: { level, isActive: !isBlockEnd },
        },
      ],
    })
  })
})

ws.on('status_update', (message) => {
  const payload = asObject(message.data) ?? {}
  const { status } = useChatStore.getState()
  const newStatus = normalizeStatusInfo(payload, status)
  useChatStore.setState({
    status: newStatus,
    thinkingLevel: newStatus.thinking_level || useChatStore.getState().thinkingLevel,
  })
})

ws.on('ask_user_required', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  console.log('[Frontend] Received ask_user_required:', message.data)
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, {
      pendingAskUser: normalizeAskUserRequest(asObject(message.data) ?? {}),
    }),
  }))
})

ws.on('ask_user_resolved', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingAskUser: null }),
  }))
})

ws.on('session_activity', (message) => {
  const payload = asObject(message.data)
  const sessionId = resolveSessionId(payload)
  if (!sessionId) return

  const isRunning = payload ? resolveRunningState(payload) : null
  useChatStore.setState((state) => {
    if (isRunning === null) {
      return { runningSessions: new Set(state.runningSessions) }
    }

    const next = new Set(state.runningSessions)
    if (isRunning) next.add(sessionId)
    else next.delete(sessionId)
    return { runningSessions: next }
  })
  useChatStore.getState().bumpSessionList()

  // Toast notification when a non-current session completes
  if (isRunning === false && sessionId !== useChatStore.getState().currentSessionId) {
    useToastStore.getState().addToast(`Session ${sessionId.slice(0, 8)} completed`, 'success')
  }
})

// ─── Plan Approval Events ────────────────────────────────────────────────────

ws.on('plan_approval_required', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  console.log('[Frontend] Received plan_approval_required:', message.data)
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, {
      pendingPlanApproval: normalizePlanApprovalRequest(asObject(message.data) ?? {}),
    }),
  }))
})

ws.on('plan_approval_resolved', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingPlanApproval: null }),
  }))
})

// ─── Subagent Events ─────────────────────────────────────────────────────────

ws.on('subagent_start', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const agent_type = payload ? readString(payload, 'agent_type') ?? 'subagent' : 'subagent'
  const description = payload ? readString(payload, 'description') ?? '' : ''
  const tool_call_id = payload ? readString(payload, 'tool_call_id', 'tool_id') : undefined
  console.log('[Frontend] Subagent start:', agent_type, description)

  const subagentMessage: Message = {
    role: 'tool_call',
    content: `Spawning ${agent_type} agent`,
    tool_call_id: tool_call_id,
    tool_name: 'spawn_subagent',
    tool_args: { agent_type, description },
    timestamp: new Date().toISOString(),
  }

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    return patchSession(state, sid, { messages: [...sessionState.messages, subagentMessage] })
  })
})

ws.on('subagent_complete', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const tool_call_id = payload ? readString(payload, 'tool_call_id', 'tool_id') : undefined
  const success = payload ? readBoolean(payload, 'success') ?? false : false
  const resultSummary = payload ? readString(payload, 'result_summary', 'summary') : undefined

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (
        msgs[i].role === 'tool_call' &&
        msgs[i].tool_name === 'spawn_subagent' &&
        (tool_call_id ? msgs[i].tool_call_id === tool_call_id : true) &&
        !msgs[i].tool_result
      ) {
        const updatedMessages = [...msgs]
        updatedMessages[i] = {
          ...msgs[i],
          tool_result: {
            success,
            output: resultSummary || (success ? 'Agent completed' : 'Agent failed'),
          },
          tool_success: success,
        }
        return patchSession(state, sid, { messages: updatedMessages })
      }
    }
    return {}
  })
})

ws.on('task_completed', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) return
  console.log('[Frontend] Task completed:', message.data.summary)
})

// ─── Progress Events ─────────────────────────────────────────────────────────

ws.on('progress', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const status = payload ? readString(payload, 'status') : undefined
  const progressMsg = payload
    ? readString(payload, 'message') ?? readString(payload, 'phase')
    : undefined

  if (status === 'complete') {
    useChatStore.setState((state) => ({
      ...patchSession(state, sid, { progressMessage: null }),
    }))
  } else {
    useChatStore.setState((state) => ({
      ...patchSession(state, sid, { progressMessage: progressMsg || 'Working...' }),
    }))
  }
})

// ─── Nested Tool Events ──────────────────────────────────────────────────────

ws.on('nested_tool_call', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const tool_name = payload ? readString(payload, 'tool_name', 'name') ?? 'tool' : 'tool'
  const args = (payload && asObject(payload.arguments)) ?? {}
  const depth = payload ? readNumber(payload, 'depth') ?? 1 : 1
  const parent = payload
    ? readString(payload, 'parent', 'parent_tool_call_id', 'tool_call_id')
    : undefined
  const toolId = payload ? readString(payload, 'tool_id', 'tool_call_id', 'id') : undefined

  const nestedMsg: Message = {
    role: 'tool_call',
    content: `Calling ${tool_name}`,
    tool_name,
    tool_args: args || {},
    tool_call_id: toolId || `nested-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    depth,
    parent_tool_call_id: parent,
    timestamp: new Date().toISOString(),
  }

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    return patchSession(state, sid, { messages: [...sessionState.messages, nestedMsg] })
  })
})

ws.on('nested_tool_result', (message) => {
  const payload = asObject(message.data)
  const sid = resolveSessionId(payload)
  if (!sid) return
  const tool_name = payload ? readString(payload, 'tool_name', 'name') ?? 'tool' : 'tool'
  const success = payload ? readBoolean(payload, 'success') ?? false : false
  const summary = payload
    ? readString(payload, 'summary', 'result_summary', 'output')
    : undefined
  const depth = payload ? readNumber(payload, 'depth') : undefined

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    // Find the last matching nested tool_call without a result
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (
        msgs[i].role === 'tool_call' &&
        msgs[i].tool_name === tool_name &&
        msgs[i].depth === depth &&
        !msgs[i].tool_result
      ) {
        const updated = [...msgs]
        updated[i] = {
          ...msgs[i],
          tool_result: { success, output: summary },
          tool_summary: summary || (success ? 'Completed' : 'Failed'),
          tool_success: success,
        }
        return patchSession(state, sid, { messages: updated })
      }
    }
    return {}
  })
})
