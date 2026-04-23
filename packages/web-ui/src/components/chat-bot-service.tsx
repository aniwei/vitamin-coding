'use client'

/**
 * ChatBotService — service mode chat UI
 *
 * Uses useCodingChat to connect directly to @vitamin/service WebSocket,
 * bypassing the legacy AI SDK + PG backend entirely.
 *
 * Activated when: NEXT_PUBLIC_CHAT_BACKEND=service
 */

import clsx from 'clsx'
import PromptInput from './prompt-input'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from 'lib/utils'
import { PreviewMessage } from './message'
import { ChatGreeting } from './chat-greeting'
import { useCodingChat } from '@/hooks/use-coding-chat'
import { UIMessage, TextUIPart } from 'ai'
import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Think } from 'ui/think'
import type { UseChatHelpers } from '@ai-sdk/react'

type Props = {
  threadId: string
  /** Passed from page.tsx but ignored — history is loaded from the service */
  initialMessages?: UIMessage[]
}

export default function ChatBotService({ threadId: _threadId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [input, setInput] = useState('')

  // Resolve the real service session ID.
  // The threadId from Next.js page is a random UUID unknown to the service.
  // We ask bridge-info for the active session; if none exists we create one.
  const [serviceSessionId, setServiceSessionId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolveSession() {
      try {
        const infoRes = await fetch('/api/coding-service/api/sessions/bridge-info')
        if (!infoRes.ok) throw new Error('bridge-info failed')
        const info: { sessionId: string | null } = await infoRes.json()
        if (info.sessionId) {
          if (!cancelled) setServiceSessionId(info.sessionId)
          return
        }
        // No active session — create one
        const createRes = await fetch('/api/coding-service/api/sessions', { method: 'POST' })
        if (!createRes.ok) throw new Error('session create failed')
        const created: { session: { id: string } } = await createRes.json()
        if (!cancelled) setServiceSessionId(created.session.id)
      } catch {
        // Retry in 2s
        if (!cancelled) setTimeout(resolveSession, 2000)
      }
    }
    resolveSession()
    return () => { cancelled = true }
  }, [])

  // No serviceUrl passed — useCodingChat defaults to the Next.js proxy path (/api/coding-service)
  // which avoids CORS. WebSocket connects directly via NEXT_PUBLIC_CODING_SERVICE_URL.
  const {
    messages,
    status,
    setMessages,
    sendMessage: sendText,
    interrupt,
    isConnected,
  } = useCodingChat({ sessionId: serviceSessionId ?? '' })

  // Use the resolved service session ID everywhere; fall back to the Next.js threadId
  // only for keying purposes (threadId is never sent to the service directly).
  const threadId = serviceSessionId ?? _threadId

  // Adapter: PromptInput.sendMessage expects UseChatHelpers['sendMessage'] signature
  // which is called with { role: 'user', parts: [...] }
  const sendMessage = useCallback<UseChatHelpers<UIMessage>['sendMessage']>(
    async (input) => {
      if (!input) return
      let text = ''
      if (typeof input === 'string') {
        text = input
      } else {
        // Extract plain text from parts
        text = (input.parts ?? [])
          .filter((p): p is TextUIPart => p.type === 'text')
          .map((p) => p.text)
          .join('')
      }
      if (!text.trim()) return
      await sendText(text)
    },
    [sendText]
  )

  const isLoading = useMemo(
    () => status === 'streaming' || status === 'submitted',
    [status]
  )

  const emptyMessage = useMemo(() => messages.length === 0, [messages.length])

  const space = useMemo(() => {
    if (!isLoading) return false
    const lastMessage = messages.at(-1)
    if (lastMessage?.role === 'user') return 'think'
    const lastPart = lastMessage?.parts.at(-1)
    if (!lastPart) return 'think'
    if (lastPart.type === 'step-start') {
      return lastMessage?.parts.length === 1 ? 'think' : 'space'
    }
    return false
  }, [isLoading, messages])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50)
  }, [])

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isAtBottom) {
      containerRef.current?.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages.length, isAtBottom])

  return (
    <div className="flex flex-row min-w-0 h-full z-40">
      <div className="w-[520px] shrink-0 flex flex-col min-h-0 relative">
        {/* Session resolving / connection status badge */}
        {(!serviceSessionId || !isConnected) && (
          <div className="absolute top-2 right-2 z-50 text-xs text-muted-foreground bg-background/80 border border-border rounded px-2 py-0.5">
            {!serviceSessionId ? 'Initializing session…' : 'Connecting…'}
          </div>
        )}

        <div
          className={cn(
            emptyMessage && 'justify-center pb-24',
            'flex flex-col flex-1 min-h-0'
          )}
        >
          {emptyMessage ? (
            <ChatGreeting />
          ) : (
            <>
              <div
                className="flex flex-col gap-2 overflow-y-auto py-6 z-10 [scrollbar-gutter:stable_both-edges]"
                ref={containerRef}
                onScroll={handleScroll}
              >
                {messages.map((message, index) => {
                  const isLastMessage = messages.length - 1 === index
                  return (
                    <PreviewMessage
                      threadId={threadId}
                      messageIndex={index}
                      prevMessage={messages[index - 1]}
                      key={message.id}
                      message={message}
                      status={status as any}
                      isLoading={isLoading}
                      isLastMessage={isLastMessage}
                      setMessages={setMessages}
                      sendMessage={sendMessage}
                      className={
                        isLastMessage &&
                        message.role !== 'user' &&
                        !space &&
                        message.parts.length > 1
                          ? 'min-h-[calc(55dvh-40px)]'
                          : ''
                      }
                    />
                  )
                })}

                {space && (
                  <>
                    <div className="w-full mx-auto max-w-3xl px-6 relative">
                      <div className={space === 'space' ? 'opacity-0' : ''}>
                        <Think />
                      </div>
                    </div>
                    <div className="min-h-[calc(55dvh-56px)]" />
                  </>
                )}

                <div className="min-w-0 min-h-52" />
              </div>
            </>
          )}

          <div
            className={clsx(
              messages.length && 'absolute bottom-14',
              'w-full z-10'
            )}
          >
            <div className="max-w-3xl mx-auto relative flex justify-center items-center -top-2">
              <ScrollToBottomButton
                show={!isAtBottom && messages.length > 0}
                onClick={scrollToBottom}
              />
            </div>

            <PromptInput
              input={input}
              threadId={threadId}
              sendMessage={sendMessage}
              setInput={setInput}
              isLoading={isLoading}
              onStop={interrupt}
              onFocus={undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Scroll to bottom button (same as ChatBot) ──────────────────────────────

interface ScrollToBottomButtonProps {
  show: boolean
  onClick: () => void
}

function ScrollToBottomButton({ show, onClick }: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.15 }}
          onClick={onClick}
          className="rounded-full shadow-md border border-border bg-background text-foreground p-1.5 hover:bg-accent transition-colors"
        >
          <ArrowDown className="size-4" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
