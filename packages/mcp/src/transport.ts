// MCP JSON-RPC 传输层
// 支持 stdio (子进程) 和 SSE (Streamable HTTP) 两种传输方式

import { spawn, type ChildProcess } from 'node:child_process'
import { createLogger } from '@vitamin/shared'
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './types'

const logger = createLogger('@vitamin/mcp:transport')

// ─── 传输层接口 ───

export interface McpTransport {
  send(message: JsonRpcRequest | JsonRpcNotification): void
  onMessage(handler: (message: JsonRpcResponse | JsonRpcNotification) => void): void
  start(): Promise<void>
  close(): Promise<void>
}

// ─── Stdio 传输 ───

export class StdioTransport implements McpTransport {
  private process: ChildProcess | null = null
  private messageHandler: ((msg: JsonRpcResponse | JsonRpcNotification) => void) | null = null
  private buffer = ''
  private readonly command: string
  private readonly args: string[]
  private readonly env: Record<string, string>

  constructor(command: string, args: string[] = [], env: Record<string, string> = {}) {
    this.command = command
    this.args = args
    this.env = env
  }

  async start(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    })

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8')
      this.processBuffer()
    })

    this.process.stderr?.on('data', (chunk: Buffer) => {
      logger.debug('MCP stderr: %s', chunk.toString('utf-8').trimEnd())
    })

    this.process.on('error', (err) => {
      logger.error('MCP process error: %s', err.message)
    })

    this.process.on('exit', (code, signal) => {
      logger.debug('MCP process exited: code=%s signal=%s', code, signal)
      this.process = null
    })
  }

  send(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('MCP stdio transport is not connected')
    }

    const json = JSON.stringify(message)
    const header = `Content-Length: ${Buffer.byteLength(json, 'utf-8')}\r\n\r\n`
    this.process.stdin.write(header + json)
  }

  onMessage(handler: (message: JsonRpcResponse | JsonRpcNotification) => void): void {
    this.messageHandler = handler
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.stdin?.end()
      this.process.kill('SIGTERM')

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL')
          resolve()
        }, 3000)

        this.process?.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })

      this.process = null
    }
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) {
        break
      }

      const header = this.buffer.slice(0, headerEnd)
      const match = /Content-Length:\s*(\d+)/i.exec(header)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = Number(match[1])
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + contentLength

      if (this.buffer.length < bodyEnd) {
        break
      }

      const body = this.buffer.slice(bodyStart, bodyEnd)
      this.buffer = this.buffer.slice(bodyEnd)

      try {
        const message = JSON.parse(body) as JsonRpcResponse | JsonRpcNotification
        this.messageHandler?.(message)
      } catch (err) {
        logger.warn('Failed to parse MCP message: %s', (err as Error).message)
      }
    }
  }
}

// ─── SSE / Streamable HTTP 传输 ───

export class SseTransport implements McpTransport {
  private messageHandler: ((msg: JsonRpcResponse | JsonRpcNotification) => void) | null = null
  private abortController: AbortController | null = null
  private sessionId: string | null = null
  private readonly baseUrl: string

  constructor(url: string) {
    this.baseUrl = url
  }

  async start(): Promise<void> {
    this.abortController = new AbortController()

    const response = await fetch(this.baseUrl, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: this.abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`MCP SSE connection failed: ${response.status} ${response.statusText}`)
    }

    const sessionId = response.headers.get('mcp-session-id')
    if (sessionId) {
      this.sessionId = sessionId
    }

    void this.consumeStream(response)
  }

  send(message: JsonRpcRequest | JsonRpcNotification): void {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    void fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: this.abortController?.signal,
    })
      .then(async (resp) => {
        if (!resp.ok) {
          logger.warn('MCP SSE POST failed: %s', resp.status)
          return
        }

        const sid = resp.headers.get('mcp-session-id')
        if (sid && !this.sessionId) {
          this.sessionId = sid
        }

        const contentType = resp.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const body = (await resp.json()) as JsonRpcResponse | JsonRpcNotification
          this.messageHandler?.(body)
        } else if (contentType.includes('text/event-stream')) {
          void this.consumeStream(resp)
        }
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          logger.warn('MCP SSE send error: %s', err.message)
        }
      })
  }

  onMessage(handler: (message: JsonRpcResponse | JsonRpcNotification) => void): void {
    this.messageHandler = handler
  }

  async close(): Promise<void> {
    this.abortController?.abort()
    this.abortController = null
  }

  private async consumeStream(response: Response): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) {
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data && data !== '[DONE]') {
              try {
                const message = JSON.parse(data) as JsonRpcResponse | JsonRpcNotification
                this.messageHandler?.(message)
              } catch {
                logger.debug('Ignoring non-JSON SSE data')
              }
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        logger.warn('MCP SSE stream error: %s', (err as Error).message)
      }
    } finally {
      reader.releaseLock()
    }
  }
}

// ─── 工厂 ───

export function createStdioTransport(
  command: string,
  args?: string[],
  env?: Record<string, string>,
): StdioTransport {
  return new StdioTransport(command, args, env)
}

export function createSseTransport(url: string): SseTransport {
  return new SseTransport(url)
}
