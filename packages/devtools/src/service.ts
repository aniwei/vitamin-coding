import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { createLogger, TypedEventEmitter, type Events } from '@x-mars/shared'

import type { DebugSnapshot, PauseResult, DebugCommand, PauseResumePayload } from './protocol'
import type { BreakpointPoint } from './protocol'
import { Breakpoints } from './tools/breakpoints'

const logger = createLogger('@x-mars/devtools:service')

const SERVICE_HOST = '127.0.0.1'

function resolveWorkerPath(): string {
  const thisFile = fileURLToPath(import.meta.url)
  const thisDir = dirname(thisFile)

  return join(thisDir, 'service-worker.cjs')
}

interface ServiceEvents extends Events {
  'Debugger.enabled': () => void
  'Debugger.disabled': () => void
  'Debugger.started': () => void
  'Debugger.stopped': () => void
  error: (error: Error) => void
}

interface ServiceOptions {
  port?: number
}
export class Service extends TypedEventEmitter<ServiceEvents> {
  private readonly id: string = randomUUID()
  private port: number | undefined
  private worker: Worker | null = null
  private started = false
  private workerStopped = false
  private breakpoints: Breakpoints
  private initializedTask: Promise<void> | null = null
  private stoppingTask: Promise<void> | null = null
  private readonly pendingPauses = new Map<
    string,
    {
      resolve: (result: PauseResult) => void
    }
  >()

  public get serviceUrl(): string {
    return `http://${SERVICE_HOST}:${this.port}/${this.id}`
  }

  public get url(): string {
    return `ws://${SERVICE_HOST}:${this.port}/${this.id}/inspect`
  }

  constructor(breakpoints: Breakpoints, options: ServiceOptions) {
    super()

    this.port = options.port
    this.breakpoints = breakpoints
  }

  broadcast(message: string): void {
    this.worker?.postMessage({ type: 'Runtime.broadcast', message })
  }

  async start(): Promise<void> {
    if (this.started) {
      return Promise.resolve()
    }

    if (this.initializedTask) {
      return this.initializedTask
    }

    this.worker = new Worker(resolveWorkerPath(), {
      workerData: {
        host: SERVICE_HOST,
        port: this.port,
        serviceId: this.id,
      },
    })
    this.workerStopped = false

    this.worker.on('message', this.handleWorkerMessage)
    this.worker.on('error', (error) => this.emit('error', error as Error))
    this.worker.on('exit', this.handleWorkerExit)

    this.initializedTask = new Promise((resolve, reject) => {
      this.once('Debugger.started', () => {
        logger.info('Agent debug service started and debugger enabled')
        this.started = true
        resolve()
      })

      this.once('error', (error) => {
        logger.error({ error }, 'Failed to start devtools service')
        reject(error)
      })
    })

    return this.initializedTask
  }

  async stop(): Promise<void> {
    if (this.stoppingTask) {
      return this.stoppingTask
    }

    if (!this.worker) {
      this.dispose()
      return Promise.resolve()
    }

    const worker = this.worker

    this.stoppingTask = new Promise<void>((resolve) => {
      let settled = false

      const finish = () => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timeoutId)
        this.off('Debugger.stopped', onStopped)
        worker.off('exit', onExit)
        this.dispose()
        this.stoppingTask = null
        resolve()
      }

      const onStopped = () => finish()
      const onExit = () => finish()

      this.on('Debugger.stopped', onStopped)
      worker.on('exit', onExit)

      const timeoutId = setTimeout(() => {
        logger.warn('Timed out waiting for devtools worker to stop; forcing dispose')
        finish()
      }, 3_000)

      try {
        worker.postMessage({
          type: 'Runtime.stop',
        })
      } catch (error) {
        logger.warn({ error }, 'Failed to post Runtime.stop to devtools worker')
        finish()
      }
    })

    return this.stoppingTask
  }

  dispose(): void {
    const worker = this.worker
    this.worker = null
    this.started = false
    this.initializedTask = null
    this.workerStopped = false

    if (this.pendingPauses.size > 0) {
      for (const [pauseId, pending] of this.pendingPauses) {
        pending.resolve({
          pauseId,
          command: { type: 'stop', seq: 0, reason: 'devtools_disposed' },
          payload: null,
        })
      }
      this.pendingPauses.clear()
    }

    if (!worker) {
      return
    }

    worker
      .terminate()
      .then(() => {
        logger.info('Devtools worker terminated')
      })
      .catch((error) => {
        logger.error({ error }, 'Failed to terminate devtools worker')
      })
  }

  forwardLog(message: unknown): void {
    this.worker?.postMessage({
      type: 'Log.entryAdded',
      message: JSON.stringify(message),
    })
  }

  pause(snapshot: DebugSnapshot): Promise<PauseResult> {
    const pauseId = randomUUID()

    return new Promise<PauseResult>((resolve) => {
      this.pendingPauses.set(pauseId, { resolve })

      this.worker?.postMessage({
        type: 'Debugger.paused',
        pauseId,
        snapshot,
      })
    })
  }

  private handleBreakpoints(requestId: string): void {
    this.worker?.postMessage({
      type: 'Debugger.breakpoints.response',
      requestId,
      success: true,
      payload: this.breakpoints?.list(),
    })
  }

  private handleBreakpointSet(requestId: string, payload: Record<string, unknown>): void {
    this.breakpoints?.set(payload.point as BreakpointPoint, payload.enabled as boolean)

    this.worker?.postMessage({
      type: 'Debugger.breakpoints.response',
      requestId,
      success: true,
    })
  }

  private handleBreakpointSetAll(requestId: string, payload: Record<string, unknown>): void {
    if (payload.enabled as boolean) {
      this.breakpoints?.enableAll()
    } else {
      this.breakpoints?.disableAll()
    }

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
        this.workerStopped = false
        this.emit('Debugger.started')
        break
      case 'Debugger.resumed': {
        const resumePauseId = payload.pauseId as string
        const pending = this.pendingPauses.get(resumePauseId)
        if (pending) {
          this.pendingPauses.delete(resumePauseId)
          pending.resolve({
            pauseId: resumePauseId,
            command: payload.command as DebugCommand,
            payload: (payload.payload as PauseResumePayload) ?? null,
          })
        }
        break
      }
      case 'Debugger.stopped':
        this.notifyWorkerStopped()
        break
      default:
        logger.warn({ payload }, 'Received unknown message from devtools worker')
    }
  }

  private handleWorkerExit = (): void => {
    this.notifyWorkerStopped()
    this.dispose()
  }

  private notifyWorkerStopped(): void {
    if (this.workerStopped) {
      return
    }

    this.workerStopped = true
    this.emit('Debugger.stopped')
  }
}

export class DevtoolsService extends Service {
  constructor(options: ServiceOptions = {}, breakpoints = new Breakpoints()) {
    super(breakpoints, options)
  }
}
