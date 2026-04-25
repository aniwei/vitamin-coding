

/**
 * useCodingChat — 连接 @vitamin/coding CodingService WebSocket，
 * 将 AgentSessionEvent (Chat.*) 映射为 AI SDK UIMessage[] 格式，
 * 提供与 useChat 相同的对外接口。
 *
 * CodingService WS 事件（来自 packages/coding/src/service/event-bridge.ts）：
 *   Chat.messageStart    → 新 assistant 消息开始
 *   Chat.messageChunk    → 文本流式增量
 *   Chat.messageComplete → assistant 消息结束
 *   Chat.toolCall        → 工具调用开始
 *   Chat.toolResult      → 工具调用结果
 *   Chat.thinkingBlock   → thinking 内容
 *   Chat.userMessage     → 用户消息回显
 *   Session.statusUpdate → 状态更新（model/tokens）
 *   Runtime.connected / Runtime.disconnected
 *
 * 用法示例:
 *   const { messages, status, currentPoint, isConnected, sendMessage, interrupt } =
 *     useCodingChat({ sessionId: threadId, serviceUrl: 'http://localhost:8080' })
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateUUID } from "@/lib/utils"
import type { UIMessage } from 'ai'

// ── WS message types from the coding service ───────────────────────

interface WsMessage {
  type: string
  data: Record<string, unknown>
}

// Status type compatible with AI SDK useChat status
export type CodingChatStatus = 'idle' | 'submitted' | 'streaming' | 'ready' | 'error'

// Session status info mirrored from CodingService
export interface CodingSessionStatus {
  model?: string
  provider?: string
  inputTokens?: number
  outputTokens?: number
  contextUsagePct?: number
}

export interface UseCodingChatOptions {
  /** Session ID to join / create on the coding service */
  sessionId: string
  /**
   * Base URL of the CodingService HTTP server.
   * Defaults to the Next.js proxy path (/api/coding-service) which avoids CORS.
   * Pass the full URL (e.g. 'http://localhost:8080') only when running outside Next.js.
   */
  serviceUrl?: string
  /** Callback when a new message arrives */
  onMessage?: (messages: UIMessage[]) => void
}

export interface UseCodingChatReturn {
  messages: UIMessage[]
  status: CodingChatStatus
  /** Current AgentSessionEvent point key, e.g. 'streaming_start', 'tool_call_start' */
  currentPoint: string | null
  isConnected: boolean
  sessionStatus: CodingSessionStatus
  sendMessage: (text: string) => Promise<void>
  interrupt: () => Promise<void>
  clearMessages: () => void
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>
}

// ── Helpers ────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ── Main hook ──────────────────────────────────────────────────────

// HTTP API calls go through the Next.js proxy to avoid CORS.
// WebSocket must still connect directly; the WS URL is derived from serviceUrl only.
const DEFAULT_SERVICE_PROXY = '/api/coding-service'
// WS needs the real service URL (for ws:// scheme). Falls back to localhost.
const DEFAULT_WS_ORIGIN =
  typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_CODING_SERVICE_URL'] ?? 'http://localhost:8080')
    : 'http://localhost:8080'

export function useCodingChat({
  sessionId,
  serviceUrl = DEFAULT_SERVICE_PROXY,
  onMessage,
}: UseCodingChatOptions): UseCodingChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [status, setStatus] = useState<CodingChatStatus>('idle')
  const [currentPoint, setCurrentPoint] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<CodingSessionStatus>({})

  // Internal refs to avoid stale closures in WS handlers
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentionalClose = useRef(false)

  // Build WS URL from HTTP URL
  // WS cannot go through the Next.js HTTP rewrite, so it always connects directly
  // to the real service origin. HTTP API calls use serviceUrl (proxy path).
  const wsUrl = DEFAULT_WS_ORIGIN.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws'

  // ── Message mutation helpers ────────────────────────────────────

  /** Start a new streaming assistant message */
  const startAssistantMessage = useCallback((id: string) => {
    const msg: UIMessage = {
      id,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
    }
    setMessages((prev) => [...prev, msg])
    return msg
  }, [])

  /** Append a text chunk to the last assistant message */
  const appendChunk = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      const parts = [...last.parts]
      const lastPart = parts[parts.length - 1]
      if (lastPart?.type === 'text') {
        parts[parts.length - 1] = { type: 'text', text: lastPart.text + chunk }
      } else {
        parts.push({ type: 'text', text: chunk })
      }
      return [...prev.slice(0, -1), { ...last, parts }]
    })
  }, [])

  /** Record a tool call on the last assistant message */
  const recordToolCall = useCallback(
    (toolCallId: string, toolName: string, args: Record<string, unknown>) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        // AI SDK v5 DynamicToolUIPart format
        const toolPart = {
          type: 'dynamic-tool' as const,
          toolCallId,
          toolName,
          state: 'input-available' as const,
          input: args,
        }
        return [
          ...prev.slice(0, -1),
          { ...last, parts: [...last.parts, toolPart as unknown as UIMessage['parts'][number]] },
        ] as UIMessage[]
      })
    },
    []
  )

  /** Update tool result on the last matching tool invocation */
  const recordToolResult = useCallback(
    (toolCallId: string, result: unknown, isError: boolean) => {
      setMessages((prev) => {
        // Find the assistant message containing this tool call
        const idx = [...prev].reverse().findIndex(
          (m) =>
            m.role === 'assistant' &&
            m.parts.some(
              (p: Record<string, unknown>) => p.type === 'dynamic-tool' &&
                (p as unknown as { toolCallId: string }).toolCallId === toolCallId
            )
        )
        if (idx === -1) return prev
        const realIdx = prev.length - 1 - idx
        const msg = prev[realIdx]!
        const updatedParts = msg.parts.map((p: Record<string, unknown>) => {
          if (p.type !== 'dynamic-tool') return p
          const tp = p as unknown as { toolCallId: string; input: unknown }
          if (tp.toolCallId !== toolCallId) return p
          if (isError) {
            return {
              ...tp,
              type: 'dynamic-tool' as const,
              state: 'output-error' as const,
              errorText: String(result ?? 'error'),
            } as unknown as UIMessage['parts'][number]
          }
          return {
            ...tp,
            type: 'dynamic-tool' as const,
            state: 'output-available' as const,
            output: result,
          } as unknown as UIMessage['parts'][number]
        })
        return [
          ...prev.slice(0, realIdx),
          { ...msg, parts: updatedParts },
          ...prev.slice(realIdx + 1),
        ] as UIMessage[]
      })
    },
    []
  )

  // ── WS event handler ───────────────────────────────────────────

  const handleWsMessage = useCallback(
    (raw: string) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(raw) as WsMessage
      } catch {
        return
      }

      const d = msg.data ?? {}

      switch (msg.type) {
        // ── Connection lifecycle ───────────────────────────────────
        case 'Runtime.connected':
          setIsConnected(true)
          break

        case 'Runtime.disconnected':
          setIsConnected(false)
          break

        // ── User message echo ──────────────────────────────────────
        case 'Chat.userMessage': {
          const content = asString(d['content'])
          const userMsg: UIMessage = {
            id: asString(d['id'], generateUUID()),
            role: 'user',
            parts: [{ type: 'text', text: content }],
          }
          setMessages((prev) => {
            // Avoid duplicate if we already added it optimistically
            if (prev.some((m) => m.role === 'user' && m.parts.some((p: Record<string, unknown>) => p.type === 'text' && (p as {text?: string}).text === content))) {
              return prev
            }
            return [...prev, userMsg]
          })
          setStatus('submitted')
          setCurrentPoint('prompt_start')
          break
        }

        // ── Assistant message streaming ────────────────────────────
        case 'Chat.messageStart': {
          const id = asString(d['id'], generateUUID())
          startAssistantMessage(id)
          setStatus('streaming')
          setCurrentPoint('streaming_start')
          break
        }

        case 'Chat.messageChunk': {
          const chunk = asString(d['chunk'] ?? d['content'])
          if (chunk) appendChunk(chunk)
          setCurrentPoint('streaming_start')
          break
        }

        case 'Chat.messageComplete': {
          setStatus('ready')
          setCurrentPoint('message_persisted')
          break
        }

        // ── Thinking block ─────────────────────────────────────────
        case 'Chat.thinkingBlock': {
          const thinking = asString(d['content'])
          if (!thinking) break
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            const thinkPart = { type: 'text' as const, text: `<think>${thinking}</think>` }
            return [
              ...prev.slice(0, -1),
              { ...last, parts: [thinkPart, ...last.parts] },
            ]
          })
          break
        }

        // ── Tool call ──────────────────────────────────────────────
        case 'Chat.toolCall': {
          const toolCallId = asString(d['toolCallId'] ?? d['id'], generateUUID())
          const toolName = asString(d['toolName'] ?? d['name'])
          const args = (d['parameters'] ?? d['args'] ?? {}) as Record<string, unknown>
          recordToolCall(toolCallId, toolName, args)
          setCurrentPoint('tool_call_start')
          break
        }

        case 'Chat.toolResult': {
          const toolCallId = asString(d['toolCallId'] ?? d['id'])
          const result = d['result']
          const isError = !!(d['error'])
          if (toolCallId) {
            recordToolResult(toolCallId, isError ? d['error'] : result, isError)
          }
          setCurrentPoint('tool_call_end')
          break
        }

        // ── Turn start ─────────────────────────────────────────────
        case 'Chat.turnStart':
          setCurrentPoint('turn_start')
          break

        // ── Session status ─────────────────────────────────────────
        case 'Session.statusUpdate': {
          setSessionStatus({
            model: asString(d['model']),
            provider: asString(d['provider'] ?? d['modelProvider']),
            inputTokens: asNumber(d['inputTokens']),
            outputTokens: asNumber(d['outputTokens']),
            contextUsagePct: asNumber(d['contextUsagePct']),
          })
          break
        }

        // ── Error ──────────────────────────────────────────────────
        case 'Runtime.error':
          setStatus('error')
          break
      }
    },
    [startAssistantMessage, appendChunk, recordToolCall, recordToolResult]
  )

  // ── Load historical messages on mount ──────────────────────────

  useEffect(() => {
    if (!sessionId) return
    // Correct endpoint: GET /api/sessions/:id/messages  (SerializedMessage[])
    fetch(`${serviceUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: unknown[]) => {
        if (!Array.isArray(raw) || raw.length === 0) return
        // SerializedMessage: { role, content, timestamp, toolCalls: { id, name, parameters }[] }
        type RawMsg = { role?: string; content?: string; toolCalls?: { id: string; name: string; parameters: Record<string, unknown> }[] }
        const converted: UIMessage[] = raw.flatMap((m) => {
          const rm = m as RawMsg
          const role = asString(rm.role)
          // Skip system / tool-result messages; they're embedded in agent context
          if (!role || role === 'system' || role === 'tool') return []
          const parts: UIMessage['parts'] = []
          const text = asString(rm.content)
          if (text) parts.push({ type: 'text', text })
          // Restore tool calls as dynamic-tool parts (AI SDK v5 DynamicToolUIPart format)
          for (const tc of rm.toolCalls ?? []) {
            parts.push({
              type: 'dynamic-tool',
              toolCallId: tc.id,
              toolName: tc.name,
              state: 'output-available',
              input: tc.parameters,
              output: null,
            } as unknown as UIMessage['parts'][number])
          }
          return [{
            id: generateUUID(),
            role: role as UIMessage['role'],
            parts: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
          }]
        })
        if (converted.length > 0) setMessages(converted)
      })
      .catch(() => {/* ignore fetch errors silently */})
  }, [sessionId, serviceUrl])

  // ── WebSocket connection ────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    intentionalClose.current = false

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Join the session to receive its events
      ws.send(
        JSON.stringify({
          method: 'Session.subscribe',
          params: { sessionId },
        })
      )
    }

    ws.onmessage = (evt) => handleWsMessage(evt.data as string)

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null
      if (!intentionalClose.current) {
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [wsUrl, sessionId, handleWsMessage])

  useEffect(() => {
    if (!sessionId) return
    connect()
    return () => {
      intentionalClose.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Notify parent when messages change
  useEffect(() => {
    onMessage?.(messages)
  }, [messages, onMessage])

  // ── Public actions ─────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return

      // Optimistic user message
      const userMsg: UIMessage = {
        id: generateUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      }
      setMessages((prev) => [...prev, userMsg])
      setStatus('submitted')
      setCurrentPoint('prompt_start')

      try {
        const resp = await fetch(`${serviceUrl}/api/chat/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, sessionId }),
        })
        if (!resp.ok) {
          setStatus('error')
        }
      } catch {
        setStatus('error')
      }
    },
    [serviceUrl, sessionId]
  )

  const interrupt = useCallback(async () => {
    try {
      await fetch(`${serviceUrl}/api/chat/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      /* ignore */
    }
  }, [serviceUrl, sessionId])

  const clearMessages = useCallback(() => {
    setMessages([])
    setStatus('idle')
    setCurrentPoint(null)
  }, [])

  return {
    messages,
    status,
    currentPoint,
    isConnected,
    sessionStatus,
    sendMessage,
    interrupt,
    clearMessages,
    setMessages,
  }
}
