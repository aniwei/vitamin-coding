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
      toolCallId: tc.id,
      toolName: tc.name,
      toolArgs: tc.parameters,
      toolArgsDisplay: undefined,
      toolResult: toolResult,
      toolSummary: tc.resultSummary || null,
      toolSuccess: !tc.error,
      toolError: tc.error || null,
      timestamp,
      depth: depth > 0 ? depth : undefined,
    })
    // 递归展开嵌套工具调用
    if (tc.nestedToolCalls && tc.nestedToolCalls.length > 0) {
      messages.push(...expandToolCalls(tc.nestedToolCalls, timestamp, depth + 1))
    }
  }
  return messages
}

/** Expand raw API messages (with toolCalls arrays) into flat message list. */
function expandMessages(rawMessages: Message[]): Message[] {
  const expanded: Message[] = []
  for (const msg of rawMessages) {
    // 在内容之前先输出思考轨迹（与 TUI 水化顺序一致）
    if (msg.thinkingTrace && msg.thinkingTrace.trim()) {
      expanded.push({
        role: 'thinking',
        content: msg.thinkingTrace,
        metadata: { level: 'Medium' },
        timestamp: msg.timestamp,
      })
    }
    if (msg.reasoningContent && msg.reasoningContent.trim()) {
      expanded.push({
        role: 'thinking',
        content: msg.reasoningContent,
        metadata: { level: 'Medium' },
        timestamp: msg.timestamp,
      })
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      if (msg.content && msg.content.trim()) {
        expanded.push({
          role: msg.role as Message['role'],
          content: msg.content,
          timestamp: msg.timestamp,
        })
      }
      expanded.push(...expandToolCalls(msg.toolCalls, msg.timestamp))
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
  // 每个会话的独立状态
  sessionStates: Record<string, PerSessionState>

  // 全局状态
  isConnected: boolean
  currentSessionId: string | null
  hasWorkspace: boolean
  status: StatusInfo | null
  thinkingLevel: 'Off' | 'Low' | 'Medium' | 'High'
  runningSessions: Set<string>
  sessionListVersion: number
  sidebarCollapsed: boolean

  // 操作方法
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
      // 已缓存，直接切换
      console.log(
        `[Frontend] Session ${sessionId} cached (${existing.messages.length} msgs), instant switch`,
      )
      set({ currentSessionId: sessionId, hasWorkspace: true })
    } else {
      // 需要请求消息
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

    // 异步发起：在后端恢复上下文
    api.resumeSession(sessionId).catch(() => {})

    // 会话切换后刷新状态
    try {
      const configData = await api.getSetting()
      set({
        thinkingLevel: configData.thinkingLevel || 'Medium',
        status: {
          mode: configData.mode || 'normal',
          autonomyLevel: configData.autonomyLevel || 'Manual',
          thinkingLevel: configData.thinkingLevel || 'Medium',
          model: configData.model,
          modelProvider: configData.modelProvider,
          workingDirectory: configData.workingDirectory || '',
          gitBranch: configData.gitBranch,
        },
      })
    } catch {
      /* ignore */
    }

    console.log(`[Frontend] Session ${sessionId} loaded successfully`)
  },

  sendMessage: async (content: string) => {
    const sessionId = get().currentSessionId
    if (!sessionId) {return}

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
      ws.sendCommand('Chat.query', { message: content, sessionId })
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
    ws.sendCommand('Chat.approval', { approvalId, approved, autoApprove })
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
    if (!status) {return}
    const newMode = status.mode === 'normal' ? 'plan' : 'normal'
    api.setMode(newMode).catch(console.error)
    set({ status: { ...status, mode: newMode } })
  },

  cycleAutonomy: () => {
    const { status } = get()
    if (!status) {return}
    const currentIdx = AUTONOMY_CYCLE.indexOf(status.autonomyLevel)
    const nextLevel = AUTONOMY_CYCLE[(currentIdx + 1) % AUTONOMY_CYCLE.length]
    api.setAutonomy(nextLevel).catch(console.error)
    set({ status: { ...status, autonomyLevel: nextLevel } })
  },

  cycleThinkingLevel: () => {
    const { status } = get()
    const currentLevel = (status?.thinkingLevel || get().thinkingLevel) as
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
      status: status ? { ...status, thinkingLevel: nextLevel } : status,
    })
  },

  respondToAskUser: (requestId: string, answers: Record<string, unknown> | null) => {
    ws.sendCommand('Chat.askUserResponse', {
      requestId,
      answers,
      cancelled: answers === null,
    })
    const sessionId = get().currentSessionId
    if (sessionId) {
      set((state) => ({
        ...patchSession(state, sessionId, { pendingAskUser: null }),
      }))
    }
  },

  respondToPlanApproval: (requestId: string, action: string, feedback?: string) => {
    ws.sendCommand('Chat.planApprovalResponse', {
      requestId,
      action,
      feedback: feedback || '',
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
    if (!sessionId) {return}

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
    if (messages[i].role === 'tool_call' && !messages[i].toolResult) {
      const updated = [...messages]
      updated[i] = {
        ...messages[i],
        toolResult: { success: false, error: 'Interrupted' },
        toolSuccess: false,
        toolError: 'Interrupted',
      }
      return updated
    }
  }
  return messages
}

// ─── WebSocket Event Handlers ───────────────────────────────────────────────

/** Resolve the session ID from a WS event, falling back to currentSessionId. */
function resolveSessionId(data: any): string | null {
  return data?.sessionId || useChatStore.getState().currentSessionId
}

let connectionStableTimer: number | null = null
let wasEverStable = false

ws.on('Runtime.connected', () => {
  useChatStore.getState().setConnected(true)
  if (wasEverStable) {
    useToastStore.getState().addToast('Reconnected to server', 'success')
  }
  connectionStableTimer = window.setTimeout(() => {
    wasEverStable = true
  }, 2000)
})

ws.on('Runtime.disconnected', () => {
  useChatStore.getState().setConnected(false)
  if (connectionStableTimer) {
    clearTimeout(connectionStableTimer)
    connectionStableTimer = null
  }
  if (wasEverStable) {
    useToastStore.getState().addToast('Disconnected from server', 'warning')
  }
})

ws.on('Chat.userMessage', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const content = message.data.content
  const sessionState = getSessionState(useChatStore.getState().sessionStates, sid)
  const msgs = sessionState.messages
  // 去重：如果最后一条用户消息已有相同内容（来自 sendMessage 的乐观添加）则跳过
  const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')
  if (lastUserMsg && lastUserMsg.content === content) {return}
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

ws.on('Chat.messageStart', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
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

ws.on('Chat.messageChunk', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  console.log('[Frontend] Received message_chunk:', message.data.content.substring(0, 100))

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = finalizeThinking(sessionState.messages)
    const lastMessage = msgs[msgs.length - 1]

    let newMessages: Message[]
    if (lastMessage && lastMessage.role === 'assistant') {
      newMessages = [
        ...msgs.slice(0, -1),
        { ...lastMessage, content: lastMessage.content + message.data.content },
      ]
    } else {
      newMessages = [...msgs, { role: 'assistant' as const, content: message.data.content }]
    }

    return patchSession(state, sid, { messages: newMessages })
  })
})

ws.on('Chat.messageComplete', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  console.log('[Frontend] Received message_complete')
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { isLoading: false, queuedMessages: [], progressMessage: null }),
  }))
})

ws.on('Runtime.error', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, {
      error: message.data.message,
      isLoading: false,
      progressMessage: null,
    }),
  }))
  useToastStore.getState().addToast(message.data.message || 'An error occurred', 'error')
})

ws.on('Chat.approvalRequired', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  console.log('[Frontend] Received approval_required:', message.data)
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingApproval: message.data as ApprovalRequest }),
  }))
})

ws.on('Chat.approvalResolved', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingApproval: null }),
  }))
})

ws.on('Chat.toolCall', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}

  const toolCallId = message.data.toolCallId || message.data.id
  const toolName = message.data.toolName || message.data.name
  const toolArgs = message.data.arguments || {}

  const toolCallMessage: Message = {
    role: 'tool_call',
    content: message.data.description || `Calling ${toolName}`,
    toolCallId,
    toolName,
    toolArgs,
    toolArgsDisplay: message.data.argumentsDisplay || null,
    timestamp: new Date().toISOString(),
  }

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    return patchSession(state, sid, { messages: [...sessionState.messages, toolCallMessage] })
  })
})

ws.on('Chat.toolResult', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages
    const callId = message.data.toolCallId || message.data.id
    const toolName = message.data.toolName || message.data.name || 'unknown'
    const success =
      typeof message.data.success === 'boolean'
        ? message.data.success
        : !message.data.isError
    const toolResultData =
      message.data.rawResult ??
      message.data.output ??
      message.data.result ??
      (success ? 'Completed' : 'Failed')
    const toolError = message.data.error || (success ? null : 'Tool failed')

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'tool_call' && msgs[i].toolCallId === callId && !msgs[i].toolResult) {
        const updatedMessages = [...msgs]
        updatedMessages[i] = {
          ...msgs[i],
          toolResult: toolResultData,
          toolSuccess: success,
          toolError,
        }
        return patchSession(state, sid, { messages: updatedMessages })
      }
    }

    console.warn(`Received tool_result for ${toolName} but no matching tool_call found`)
    return {}
  })
})

ws.on('Chat.thinkingBlock', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const action = message.data.action
  const isBlockStart = action === 'start' || message.data.blockStart === true
  const isBlockEnd = action === 'end'
  const content = action === 'delta' ? (message.data.delta || '') : (message.data.content || '')

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    // 如果块开始，始终创建一个新的思考消息
    if (isBlockStart) {
      return patchSession(state, sid, {
        messages: [
          ...msgs,
          {
            role: 'thinking' as const,
            content: '',
            metadata: { level: message.data.level || 'Medium', isActive: true },
          },
        ],
      })
    }

    // 否则，将内容追加到最后一个活跃的思考消息
    const lastIdx = msgs.length - 1
    if (lastIdx >= 0 && msgs[lastIdx].role === 'thinking' && msgs[lastIdx].metadata?.isActive) {
      const updated = [...msgs]
      updated[lastIdx] = {
        ...msgs[lastIdx],
        content: msgs[lastIdx].content + content,
        metadata: {
          ...msgs[lastIdx].metadata,
          isActive: isBlockEnd ? false : msgs[lastIdx].metadata?.isActive,
        },
      }
      return patchSession(state, sid, { messages: updated })
    }

    // 没有活跃的思考块 — 创建一个新的
    return patchSession(state, sid, {
      messages: [
        ...msgs,
        {
          role: 'thinking' as const,
          content,
          metadata: { level: message.data.level || 'Medium', isActive: !isBlockEnd },
        },
      ],
    })
  })
})

ws.on('Session.statusUpdate', (message) => {
  const { status } = useChatStore.getState()
  const newStatus = {
    ...status,
    ...message.data,
  } as StatusInfo
  useChatStore.setState({
    status: newStatus,
    thinkingLevel: newStatus.thinkingLevel || useChatStore.getState().thinkingLevel,
  })
})

ws.on('Chat.toolExecutionEvent', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}

  const event = message.data.event
  if (!event || event.type !== 'progress') {return}

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'tool_call' && msgs[i].toolCallId === event.toolCallId) {
        const existing = typeof msgs[i].toolResult === 'string' ? msgs[i].toolResult : ''
        const next = existing ? `${existing}\n${event.update}` : event.update
        const updatedMessages = [...msgs]
        updatedMessages[i] = {
          ...msgs[i],
          toolResult: next,
        }
        return patchSession(state, sid, { messages: updatedMessages })
      }
    }

    return {}
  })
})

ws.on('Chat.askUserRequired', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  console.log('[Frontend] Received ask_user_required:', message.data)
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingAskUser: message.data as AskUserRequest }),
  }))
})

ws.on('Chat.askUserResolved', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingAskUser: null }),
  }))
})

ws.on('Session.activity', (message) => {
  const { sessionId, status, running } = message.data

  const isRunning = running === true || status === 'running'
  useChatStore.setState((state) => {
    const next = new Set(state.runningSessions)
    if (isRunning) {next.add(sessionId)}
    else {next.delete(sessionId)}
    return { runningSessions: next }
  })
  useChatStore.getState().bumpSessionList()

  // 非当前会话完成时发出 Toast 通知
  if (!isRunning && sessionId !== useChatStore.getState().currentSessionId) {
    useToastStore.getState().addToast(`Session ${sessionId.slice(0, 8)} completed`, 'success')
  }
})

// ─── Plan Approval Events ────────────────────────────────────────────────────

ws.on('Chat.planApprovalRequired', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  console.log('[Frontend] Received plan_approval_required:', message.data)
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingPlanApproval: message.data as PlanApprovalRequest }),
  }))
})

ws.on('Chat.planApprovalResolved', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  useChatStore.setState((state) => ({
    ...patchSession(state, sid, { pendingPlanApproval: null }),
  }))
})

// ─── Subagent Events ─────────────────────────────────────────────────────────

ws.on('Chat.subagentStart', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const { agentType, description, toolCallId } = message.data
  console.log('[Frontend] Subagent start:', agentType, description)

  const subagentMessage: Message = {
    role: 'tool_call',
    content: `Spawning ${agentType} agent`,
    toolCallId,
    toolName: 'spawn_subagent',
    toolArgs: { agentType, description },
    timestamp: new Date().toISOString(),
  }

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    return patchSession(state, sid, { messages: [...sessionState.messages, subagentMessage] })
  })
})

ws.on('Chat.subagentComplete', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const { toolCallId, success, outputTail, resultSummary, summary } = message.data

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (
        msgs[i].role === 'tool_call' &&
        msgs[i].toolName === 'spawn_subagent' &&
        msgs[i].toolCallId === toolCallId &&
        !msgs[i].toolResult
      ) {
        const updatedMessages = [...msgs]
        updatedMessages[i] = {
          ...msgs[i],
          toolResult: {
            success,
            output:
              outputTail ||
              resultSummary ||
              summary ||
              (success ? 'Agent completed' : 'Agent failed'),
          },
          toolSuccess: success,
        }
        return patchSession(state, sid, { messages: updatedMessages })
      }
    }
    return {}
  })
})

ws.on('Chat.taskCompleted', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  console.log('[Frontend] Task completed:', message.data.summary)
})

// ─── Progress Events ─────────────────────────────────────────────────────────

ws.on('Chat.progress', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const { status, message: progressMsg } = message.data

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

ws.on('Chat.nestedToolCall', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const { toolName, arguments: args, depth, parentToolCallId } = message.data

  const nestedMsg: Message = {
    role: 'tool_call',
    content: `Calling ${toolName}`,
    toolName,
    toolArgs: args || {},
    toolCallId: `nested-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    depth: depth || 1,
    parentToolCallId,
    timestamp: new Date().toISOString(),
  }

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    return patchSession(state, sid, { messages: [...sessionState.messages, nestedMsg] })
  })
})

ws.on('Chat.nestedToolResult', (message) => {
  const sid = resolveSessionId(message.data)
  if (!sid) {return}
  const { toolName, success, summary, depth } = message.data

  useChatStore.setState((state) => {
    const sessionState = getSessionState(state.sessionStates, sid)
    const msgs = sessionState.messages

    // 找到最后一个匹配的嵌套工具调用（无结果）
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (
        msgs[i].role === 'tool_call' &&
        msgs[i].toolName === toolName &&
        msgs[i].depth === depth &&
        !msgs[i].toolResult
      ) {
        const updated = [...msgs]
        updated[i] = {
          ...msgs[i],
          toolResult: { success, output: summary },
          toolSummary: summary || (success ? 'Completed' : 'Failed'),
          toolSuccess: success,
        }
        return patchSession(state, sid, { messages: updated })
      }
    }
    return {}
  })
})
