import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { createLogger, TypedEventEmitter, type Events } from '@vitamin/shared'

import type { DebugSnapshot, PauseResult, PauseResumePayload, DebugCommand } from './protocol'
import type { BreakpointPoint } from './protocol'
import type { Breakpoints } from './tools/breakpoints'
import {
  WAKE_PENDING,
  WAKE_RESUMED,
  WAKE_WITH_PAYLOAD,
  SAB_HEADER_SIZE,
  SAB_DEFAULT_PAYLOAD_SIZE,
  COMMAND_CONTINUE,
  COMMAND_NEXT,
  COMMAND_STEP,
  COMMAND_OVER,
  COMMAND_STOP,
} from './protocol'

const logger = createLogger('@vitamin/devtools:service')

const SERVICE_HOST = '127.0.0.1'

function resolveWorkerPath(): string {
  const thisFile = fileURLToPath(import.meta.url)
  const thisDir = dirname(thisFile)

  // 当前模块仍是 .ts 说明由 tsx / ts-node 直接运行，worker 同样使用 .ts
  if (thisFile.endsWith('.ts')) {
    return join(thisDir, 'service-worker.ts')
  }

  return join(thisDir, 'service-worker.cjs')
}

interface ServiceEvents extends Events {
  'Debugger.enabled': () => void,
  'Debugger.disabled': () => void,
  'Debugger.started': () => void,
  'Debugger.stopped': () => void,
  'error': (error: Error) => void,
}

interface ServiceOptions {
  port?: number
}
export class Service extends TypedEventEmitter<ServiceEvents> {
  private readonly id: string = randomUUID()
  private port: number | undefined
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

  constructor(
    breakpoints: Breakpoints,
    options: ServiceOptions
  ) {
    super()

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

  pause(snapshot: DebugSnapshot): PauseResult {
    const totalSize = SAB_HEADER_SIZE + SAB_DEFAULT_PAYLOAD_SIZE
    const sab = new SharedArrayBuffer(totalSize)
    const header = new Int32Array(sab, 0, 3)
    const payloadRegion = new Uint8Array(sab, SAB_HEADER_SIZE)

    this.worker?.postMessage({
      type: 'paused',
      snapshot,
      shared: sab,
    })

    Atomics.wait(header, 0, WAKE_PENDING)

    const stateValue = Atomics.load(header, 0)

    if (stateValue !== WAKE_RESUMED && stateValue !== WAKE_WITH_PAYLOAD) {
      throw new Error(`Devtools pause resumed with unexpected state: ${stateValue}`)
    }

    const command = this.decodeCommand(Atomics.load(header, 1))

    let payload: PauseResumePayload | null = null
    if (stateValue === WAKE_WITH_PAYLOAD) {
      const payloadLength = Atomics.load(header, 2)
      if (payloadLength > 0) {
        const jsonBytes = payloadRegion.slice(0, payloadLength)
        const jsonStr = new TextDecoder().decode(jsonBytes)
        payload = JSON.parse(jsonStr) as PauseResumePayload
      }
    }

    return { command, payload }
  }

  private decodeCommand(typeInt: number): DebugCommand {
    const seq = Date.now()
    switch (typeInt) {
      case COMMAND_NEXT: return { type: 'next', seq }
      case COMMAND_STEP: return { type: 'step', seq }
      case COMMAND_OVER: return { type: 'over', seq, depth: 0 }
      case COMMAND_STOP: return { type: 'stop', seq }
      case COMMAND_CONTINUE:
      default: return { type: 'continue', seq }
    }
  }

  private handleBreakpoints(requestId: string): void {
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
        this.handleBreakpoints(requestId)
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
        if (typeof payload.port === 'number') {
          this.port = payload.port
        }
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
