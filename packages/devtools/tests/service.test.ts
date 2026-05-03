import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it, beforeAll, afterAll } from 'vitest'

let originalNodeEnv: string | undefined
beforeAll(() => {
  originalNodeEnv = process.env['NODE_ENV']
  process.env['NODE_ENV'] = 'production'
})
afterAll(() => {
  process.env['NODE_ENV'] = originalNodeEnv
})

const testDir = dirname(fileURLToPath(import.meta.url))
const devtoolsDistUrl = pathToFileURL(resolve(testDir, '../dist/index.js')).href

async function loadDevtoolsDist(): Promise<{
  DevtoolsService: new (
    options?: { port?: number },
    breakpoints?: unknown,
  ) => {
    url: string
    start(): Promise<void>
    stop(): Promise<void>
    broadcast(message: string): void
    pause(snapshot: {
      turn: number
      point: string
      frameDepth: number
      messagesCount: number
    }): Promise<unknown>
  }
  Breakpoints: new () => unknown
}> {
  return import(/* @vite-ignore */ devtoolsDistUrl) as Promise<{
    DevtoolsService: new (
      options?: { port?: number },
      breakpoints?: unknown,
    ) => {
      url: string
      start(): Promise<void>
      stop(): Promise<void>
      broadcast(message: string): void
      pause(snapshot: {
        turn: number
        point: string
        frameDepth: number
        messagesCount: number
      }): Promise<unknown>
    }
    Breakpoints: new () => unknown
  }>
}

describe('DevtoolService', () => {
  it('starts and stops service without throwing', async () => {
    const { DevtoolsService, Breakpoints } = await loadDevtoolsDist()
    const service = new DevtoolsService({}, new Breakpoints())

    await service.start()
    expect(service.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/.+\/inspect$/)
    await service.stop()
  }, 15_000)

  it('stopping twice is safe and idempotent', async () => {
    const { DevtoolsService, Breakpoints } = await loadDevtoolsDist()
    const service = new DevtoolsService({}, new Breakpoints())

    await service.start()
    await service.stop()
    await service.stop()
  }, 15_000)

  it('resolves pending pause with stop command when service is disposed', async () => {
    const { DevtoolsService, Breakpoints } = await loadDevtoolsDist()
    const service = new DevtoolsService({}, new Breakpoints())

    await service.start()
    const paused = service.pause({
      turn: 1,
      point: 'model_before',
      frameDepth: 0,
      messagesCount: 3,
    })

    await service.stop()
    await expect(paused).resolves.toMatchObject({
      command: {
        type: 'stop',
        reason: 'devtools_disposed',
      },
      payload: null,
    })
  }, 15_000)
})
