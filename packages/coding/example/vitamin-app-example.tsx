import { createVitamin } from '../src'

type DebugCommand = 'next' | 'step' | 'over' | 'continue' | 'stop'

interface DebuggerClientOptions {
  autoContinue?: boolean
}

class VitaminDebuggerClient {
  private ws: {
    close: () => void
    addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
    removeEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
  } | null = null
  private seq = 1
  private readonly commandUrl: string
  private readonly wsUrl: string
  private readonly autoContinue: boolean
  private readonly onMessage = (event: { data?: unknown }) => {
    this.handleMessage(event).catch((error) => {
      console.error('[Debugger Client] Failed to process WS message:', error)
    })
  }

  constructor(pauseUrl: string, options: DebuggerClientOptions = {}) {
    this.autoContinue = options.autoContinue ?? true
    this.commandUrl = pauseUrl.replace('/paused', '/command')
    this.wsUrl = pauseUrl
      .replace('/command/debugger/paused', '/ws')
      .replace('http://', 'ws://')
      .replace('https://', 'wss://')
  }

  connect() {
    const SocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => unknown }).WebSocket
    if (!SocketCtor) {
      throw new Error('Current Node.js runtime does not provide global WebSocket support')
    }

    const socket = new SocketCtor(this.wsUrl) as {
      close: () => void
      addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
      removeEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
    }

    socket.addEventListener('open', () => {
      console.log('[Debugger Client] WebSocket connection established')
    })

    socket.addEventListener('error', (event) => {
      console.error('[Debugger Client] WebSocket error:', event)
    })

    socket.addEventListener('close', (event) => {
      console.log('[Debugger Client] WebSocket connection closed:', event)
    })


    this.ws = socket
    socket.addEventListener('message', this.onMessage)

    console.log('[Debugger Client] Connected:', this.wsUrl)
  }

  async sendCommand(type: DebugCommand) {
    const command = { type, seq: this.seq++ }
    const response = await fetch(this.commandUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Debugger command failed: ${response.status} ${response.statusText} ${detail}`.trim())
    }
  }

  close() {
    if (!this.ws) {
      return
    }

    this.ws.removeEventListener('message', this.onMessage)
    this.ws.close()
    this.ws = null
  }

  private async handleMessage(event: { data?: unknown }) {
    const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '')
    const message = JSON.parse(raw) as { type?: string; snapshot?: unknown }

    if (message.type !== 'Agent.debugger.paused') {
      return
    }

    console.log('[Debugger Client] Paused snapshot:', message.snapshot)
    if (this.autoContinue) {
      await this.sendCommand('continue')
      console.log('[Debugger Client] Sent continue')
    }
  }
}

function resolveDebuggerPauseUrl(vitaminApp: unknown): string {
  const app = vitaminApp as {
    devtools?: {
      debugger?: {
        serviceUrl?: string
      }
    }
  }

  const pauseUrl = app.devtools?.debugger?.serviceUrl
  if (!pauseUrl) {
    throw new Error('Cannot resolve debugger pause URL from VitaminApp internals')
  }

  return pauseUrl
}

async function main() {
  const vitamin = createVitamin({
    port: 3000,
    inspect: true,
    logger: {
      name: 'vitamin-app',
      level: 'trace',
      destination: 'vitamin-app.log',
    },
    model: {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
      },
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
    },
    systemPrompt: 'You are a helpful coding assistant.',
  })

  let debuggerClient: VitaminDebuggerClient | null = null

  try {
    await vitamin.start()

    const pauseUrl = resolveDebuggerPauseUrl(vitamin)
    debuggerClient = new VitaminDebuggerClient(pauseUrl, { autoContinue: true })
    debuggerClient.connect()

    // 创建多个独立会话
    // const sessionA = await vitamin.createSession({ id: 'session-a' })
    // const sessionB = await vitamin.createSession({ id: 'session-b' })

    // 监听会话事件
    // sessionA.on('prompt_start', (sessionId, prompt) => {
    //   console.log('[Session A]', sessionId, prompt)
    // })

    // // 每个会话独立运行 Agent
    // await sessionA.prompt('List all .ts files in src/')
    // await sessionB.prompt('Explain the architecture of this project')

    // 列出所有活跃会话
    const sessions = vitamin.listSessions()
    console.log('Active sessions:', sessions.length)

    // 通过 ID 检索会话
    const found = vitamin.getSession('session-a')
    console.log('Found session:', found?.id)

    // Steering: 在 Agent 工具执行间隙注入消息
    // sessionA.steer('Also check for unused exports')

    // FollowUp: 在 Agent 完成后追加消息
    // sessionA.followUp('Now summarize the results')

    // 移除会话
    await vitamin.removeSession('session-b')
    console.log('After removal:', vitamin.listSessions().length)
  } finally {
    debuggerClient?.close()
    await vitamin.stop()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})