// WebSocket 客户端 — 用于支持 OpenAI Codex 等 WebSocket-based 流式 API
import { ProviderError } from '@vitamin/shared'

import type { SseEvent } from './http-client'

// WebSocket 连接选项
export interface WsConnectOptions {
  url: string
  headers?: Record<string, string>
  timeout?: number
  signal?: AbortSignal
}

// WebSocket 请求选项（发送消息后收流）
export interface WsStreamOptions {
  url: string
  headers?: Record<string, string>
  body: Record<string, unknown>
  timeout?: number
  signal?: AbortSignal
}

// 将 WebSocket URL 从 https/http 转为 wss/ws
function toWsUrl(url: string): string {
  return url.replace(/^http/, 'ws')
}

// WebSocket 流式请求 — 返回 SSE 兼容的事件迭代器
// 协议: 连接后发送 JSON 请求，服务端推送 JSON 事件直到关闭
export async function* wsStreamRequest(options: WsStreamOptions): AsyncIterable<SseEvent> {
  const { url, headers = {}, body, timeout = 300000, signal } = options

  const wsUrl = toWsUrl(url)
  const queue: SseEvent[] = []
  let resolve: (() => void) | undefined
  let error: Error | undefined
  let closed = false

  const ws = new WebSocket(wsUrl, {
    headers,
  } as never)

  const timer = setTimeout(() => {
    error = new ProviderError('WebSocket connection timed out', {
      code: 'PROVIDER_TIMEOUT',
    })
    ws.close()
  }, timeout)

  // 监听 abort signal
  const onAbort = () => {
    error = new ProviderError('WebSocket stream aborted', {
      code: 'PROVIDER_TIMEOUT',
    })
    ws.close()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  // 等待连接打开
  await new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => {
      // 连接成功，发送请求
      ws.send(JSON.stringify(body))
      res()
    }, { once: true })

    ws.addEventListener('error', (ev) => {
      rej(new ProviderError('WebSocket connection failed', {
        code: 'PROVIDER_NETWORK_ERROR',
        cause: new Error(String(ev)),
      }))
    }, { once: true })
  })

  // 收集消息
  ws.addEventListener('message', (ev) => {
    const data = typeof ev.data === 'string' ? ev.data : ''
    if (!data) return

    // 尝试解析为 JSON 事件（OpenAI Codex 协议）
    // 同时兼容 SSE 格式的 data-only 消息
    queue.push({ data, event: undefined, id: undefined })
    resolve?.()
  })

  ws.addEventListener('close', () => {
    closed = true
    resolve?.()
  })

  ws.addEventListener('error', (ev) => {
    if (!error) {
      error = new ProviderError('WebSocket error during streaming', {
        code: 'PROVIDER_STREAM_ERROR',
        cause: new Error(String(ev)),
      })
    }
    closed = true
    resolve?.()
  })

  try {
    // 迭代返回事件
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        const event = queue.shift()
        if (event) yield event
        continue
      }
      if (closed) break

      // 等待新消息或关闭
      await new Promise<void>((res) => {
        resolve = res
      })
      resolve = undefined
    }

    if (error) throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }
}
