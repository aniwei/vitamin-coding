import { createServer } from 'node:net'

import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'

import { DevtoolService } from '../src/service'

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

function connectWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)

    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error(`WebSocket connect timeout: ${url}`))
    }, 3_000)

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
  it('starts service and closes connected websocket clients', async () => {
    const port = await getFreePort()
    const service = new DevtoolService(port)

    await service.start()
    const ws = await connectWebSocket(`ws://localhost:${port}`)

    const closed = waitForClose(ws)
    service.close()

    await closed
  })

  it('broadcasts message to websocket clients', async () => {
    const port = await getFreePort()
    const service = new DevtoolService(port)

    await service.start()
    const ws = await connectWebSocket(`ws://localhost:${port}`)

    const incoming = waitForMessage(ws)
    service.broadcast('vitamin-devtools-broadcast')

    await expect(incoming).resolves.toBe('vitamin-devtools-broadcast')

    service.close()
    await waitForClose(ws)
  })
})
