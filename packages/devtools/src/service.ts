import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'node:http'
import { Worker } from 'node:worker_threads'
import { createLogger, TypedEventEmitter, type Events } from '@vitamin/shared'

import type { DebugSnapshot } from './protocol'
import type { BreakpointPoint } from './protocol'
import type { Breakpoints } from './tools/breakpoints'

const logger = createLogger('@vitamin/devtools:service')

const SERVICE_HOST = '127.0.0.1'
const WAKE_PENDING = 0
const WAKE_RESUMED = 1

function resolveWorkerPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url))

  if (process.env.NODE_ENV === 'production') {
    return join(thisDir, 'service-worker.cjs')
  }

  return join(thisDir, 'service-worker.ts')
}

interface DevtoolsServiceEvents extends Events {
  'Debugger.enabled': () => void,
  'Debugger.disabled': () => void,
  'Debugger.started': () => void,
  'Debugger.stopped': () => void,
  'error': (error: Error) => void,
}

interface DevtoolsServiceOptions {
  port: number
  server?: Server
  noServer: boolean
}
export class DevtoolsService extends TypedEventEmitter<DevtoolsServiceEvents> {
  private readonly port: number
  private readonly id: string = randomUUID()
  private worker: Worker | null = null
  private started = false
  private breakpoints: Breakpoints
  private initializeTask: Promise<void> | null = null

  public get serviceUrl(): string {
    return `http://${SERVICE_HOST}:${this.port}/${this.id}`
  }

  public get url(): string {
    return `ws://${SERVICE_HOST}:${this.port}/${this.id}/ws`
  }

  public get debuggerPauseUrl(): string {
    return `${this.serviceUrl}/command/debugger/paused`
  }

  public get debuggerCommandUrl(): string {
    return `${this.serviceUrl}/command/debugger/command`
  }

  public get loggerUrl(): string {
    return `${this.serviceUrl}/command/logger`
  }

  public get sessionUrl(): string {
    return `${this.serviceUrl}/command/session`
  }

  constructor(options: DevtoolsServiceOptions, breakpoints: Breakpoints) {
    super()
    if (options.noServer && options.port) {
      throw new Error('Cannot specify a port when noServer is true')
    }

    this.port = options.port
    this.breakpoints = breakpoints
  }

  broadcast(message: string): void {
    this.worker?.postMessage({ type: 'broadcast', message })
  }

  async start(): Promise<void> {
    if (this.started) {
      return Promise.resolve()
    }

    if (this.initializeTask) {
      return this.initializeTask
    }

    this.worker = new Worker(resolveWorkerPath(), {
      workerData: {
        host: SERVICE_HOST,
        port: this.port,
        serviceId: this.id,
      }
    })

    this.worker.on('message', this.handleWorkerMessage)
    this.worker.on('error', error => this.emit('error', error as Error))
    this.worker.on('exit',  () => this.dispose())
    
    this.initializeTask = new Promise((resolve, reject) => {
      this.once('Debugger.started', () => {
        logger.info('Agent debug service started and debugger enabled')
        this.started = true
        resolve()
      })

      this.once('error', error => {
        logger.error({ error }, 'Failed to start devtools service')
        reject(error)
      })
    })

    return this.initializeTask
  }

  async stop(): Promise<void> {
    await new Promise<void>(async (resolve) => {
      this.once('Debugger.stopped', async () => {
        this.dispose()
        resolve()
      })

      this.worker?.postMessage({ type: 'stop' })
    })
  }

  dispose(): void {
    this.worker?.terminate().then(() => {
      this.worker = null
      this.started = false
      this.initializeTask = null

      logger.info('Devtools worker terminated')
    }).catch(error => {
      logger.error({ error }, 'Failed to terminate devtools worker')
    }) 
  }

  logger(message: unknown): void {
    this.worker?.postMessage({ type: 'logger', message: JSON.stringify(message) })
  }

  session(message: unknown): void {
    this.worker?.postMessage({ 
      type: 'session', 
      message: JSON.stringify(message) 
    })
  }

  pause(snapshot: DebugSnapshot): void {
    const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    const state = new Int32Array(sab)

    this.worker?.postMessage({
      type: 'paused',
      snapshot,
      shared: sab,
    })

    Atomics.wait(state, 0, WAKE_PENDING)

    if (Atomics.load(state, 0) !== WAKE_RESUMED) {
      throw new Error('Devtools pause resumed with an unexpected state')
    }
  }

  private handleBreakpointList(requestId: string): void {
    this.worker?.postMessage({
      type: 'Debugger.breakpoints.response',
      requestId,
      success: true,
      payload: this.breakpoints?.list()
    })
  }

  private handleBreakpointSet(requestId: string, payload: Record<string, unknown>): void {
    this.breakpoints?.set(
      payload.point as BreakpointPoint, 
      payload.enabled as boolean
    )

    this.worker?.postMessage({
      type: 'Debugger.breakpoints.response',
      requestId,
      success: true
    })
  }

  private handleBreakpointSetAll(requestId: string, payload: Record<string, unknown>): void {
    payload.enabled as boolean 
      ? this.breakpoints?.enableAll() 
      : this.breakpoints?.disableAll()
    
    this.worker?.postMessage({
      type: 'Debugger.breakpoints.response',
      requestId,
      success: true,
    })
  }

  private handleWorkerMessage = (message: unknown): void => {
    const payload = message as Record<string, unknown>
    const requestId = payload.requestId as string

    switch (payload.type) {
      case 'Debugger.breakpoints.list':
        this.handleBreakpointList(requestId)
        break
      case 'Debugger.breakpoints.set':
        this.handleBreakpointSet(requestId, payload)
        break
      case 'Debugger.breakpoints.setAll':
        this.handleBreakpointSetAll(requestId, payload)
        break
      case 'Debugger.enabled':
        this.emit('Debugger.enabled')
        break
      case 'Debugger.disabled':
        this.emit('Debugger.disabled')
        break
      case 'Debugger.started':
        this.emit('Debugger.started')
        break
      case 'Debugger.stopped':
        this.emit('Debugger.stopped')
        break
      default:
        logger.warn({ payload }, 'Received unknown message from devtools worker')
    }
  }
}
