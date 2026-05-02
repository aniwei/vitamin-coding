import { Service } from './service'
import { Breakpoints } from './tools/breakpoints'
import { Debugger } from './tools/debugger'
import { AuditTraceRecorder } from './audit-trace'
import type { AuditTrace, AuditTraceRecorderOptions } from './audit-trace'

interface DevtoolsOptions {
  port?: number
  auditTrace?: AuditTraceRecorderOptions
}

export class Devtools {
  public readonly service: Service
  public readonly debugger: Debugger
  public readonly auditTrace: AuditTraceRecorder
  private readonly breakpoints: Breakpoints

  constructor(options: DevtoolsOptions = {}) {
    this.breakpoints = new Breakpoints()
    this.auditTrace = new AuditTraceRecorder(options.auditTrace)
    this.service = new Service(this.breakpoints, { port: options.port })
    this.debugger = new Debugger(this.service, this.breakpoints, this.auditTrace)
  }

  sendLog(message: unknown): void {
    this.service.forwardLog(message)
  }

  start() {
    return this.service.start()
  }

  stop() {
    return this.service.stop()
  }

  exportAuditTrace(): AuditTrace {
    return this.auditTrace.export()
  }
}

export const createDevtools = (options: DevtoolsOptions) => {
  return new Devtools(options)
}
