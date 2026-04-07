import { createServer } from 'node:net'

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'

// service-worker.ts 在测试环境中通过 Worker 线程运行，Node.js 原生不支持 TypeScript。
// 从已构建的 dist/index.js 导入，配合 NODE_ENV='production'，使 resolveWorkerPath
// 返回同目录下编译完成的 service-worker.cjs。
let originalNodeEnv: string | undefined
beforeAll(() => {
  originalNodeEnv = process.env['NODE_ENV']
  process.env['NODE_ENV'] = 'production'
})
afterAll(() => {
  process.env['NODE_ENV'] = originalNodeEnv
})

// 从 dist 导入：import.meta.url 指向 dist/index.js，生产路径解析到 dist/service-worker.cjs
import { DevtoolsService, Breakpoints } from '../dist/index.js'

/**
 * service-worker.ts 中 handleUpgrade 校验路径为 `/${serviceId}/inspect`。
 * DevtoolsService.url 已与实际监听路径保持一致。
 */
function inspectUrl(service: DevtoolsService): string {
  return service.url
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate free port')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

function connectWebSocketOnce(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)

    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error(`WebSocket connect timeout: ${url}`))
    }, timeoutMs)

    ws.once('open', () => {
      clearTimeout(timeout)
      resolve(ws)
    })

    ws.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

async function connectWebSocket(
  url: string,
  options?: { timeoutMs?: number; retryIntervalMs?: number },
): Promise<WebSocket> {
  const timeoutMs = options?.timeoutMs ?? 10_000
  const retryIntervalMs = options?.retryIntervalMs ?? 100
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      return await connectWebSocketOnce(url, Math.min(2_000, timeoutMs))
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs))
    }
  }

  throw new Error(`WebSocket connect timeout: ${url}; lastError=${String(lastError)}`)
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.once('close', () => resolve())
  })
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(data.toString())
    })
  })
}

describe('DevtoolService', () => {
  // DevtoolsService 依赖 Worker 线程运行 service-worker.cjs，属于集成级测试。
  it('starts service and closes connected websocket clients', async () => {
    const port = await getFreePort()
    const service = new DevtoolsService({ port }, new Breakpoints())

    await service.start()
    // service-worker 实际监听路径为 /${serviceId}/inspect
    const ws = await connectWebSocket(inspectUrl(service))

    const closed = waitForClose(ws)
    await service.stop()

    await closed
  }, 15_000)

  it('broadcasts message to websocket clients', async () => {
    const port = await getFreePort()
    const service = new DevtoolsService({ port }, new Breakpoints())

    await service.start()
    const ws = await connectWebSocket(inspectUrl(service))

    const incoming = waitForMessage(ws)
    service.broadcast('vitamin-devtools-broadcast')

    await expect(incoming).resolves.toBe('vitamin-devtools-broadcast')

    const closed = waitForClose(ws)
    await service.stop()
    await closed
  }, 15_000)

  it('waits for a websocket command before resuming paused requests', async () => {
    const port = await getFreePort()
    const service = new DevtoolsService({ port }, new Breakpoints())

    await service.start()
    const ws = await connectWebSocket(inspectUrl(service))

    const pausedEvent = waitForMessage(ws)
    const resumeResult = service.pause({
      turn: 1,
      point: 'model_before',
      frameDepth: 0,
      messagesCount: 3,
    })

    await expect(pausedEvent).resolves.toContain('Debugger.paused')

    ws.send(JSON.stringify({ type: 'continue' }))

    await expect(resumeResult).resolves.toMatchObject({
      command: {
        type: 'continue',
      },
      payload: null,
    })

    const closed = waitForClose(ws)
    await service.stop()
    await closed
  }, 15_000)

})
