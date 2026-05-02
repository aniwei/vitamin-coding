import { createLogger } from '@x-mars/shared'
import { Breakpoints, type Breakpoint } from './breakpoints'
import type { BreakpointPoint, DebugSnapshot, PauseResult } from '../protocol'
import type { Service } from '../service'
import type { AuditTraceRecorder } from '../audit-trace'

const logger = createLogger('@x-mars/devtools:debugger')

export class Debugger {
  public readonly breakpoints: Breakpoints
  private readonly service: Service
  private readonly auditTrace?: AuditTraceRecorder

  public get serviceUrl(): string {
    return this.service.url
  }

  constructor(service: Service, breakpoints: Breakpoints, auditTrace?: AuditTraceRecorder) {
    this.service = service
    this.breakpoints = breakpoints
    this.auditTrace = auditTrace
  }

  listBreakpoints(): Breakpoint[] {
    return this.breakpoints.list()
  }

  getBreakpoint(point: BreakpointPoint): Breakpoint | undefined {
    return this.breakpoints.get(point)
  }

  setBreakpoint(point: BreakpointPoint, enabled: boolean): Breakpoint {
    return this.breakpoints.set(point, enabled)
  }

  enableBreakpoint(point: BreakpointPoint): Breakpoint {
    return this.breakpoints.enable(point)
  }

  disableBreakpoint(point: BreakpointPoint): Breakpoint {
    return this.breakpoints.disable(point)
  }

  enableAllBreakpoints(): void {
    this.breakpoints.enableAll()
  }

  disableAllBreakpoints(): void {
    this.breakpoints.disableAll()
  }

  async pause(message: DebugSnapshot): Promise<PauseResult | undefined> {
    this.auditTrace?.recordSnapshot(message)
    if (this.shouldPause(message.point)) {
      logger.debug({ message }, 'Pausing execution at breakpoint')
      return this.service.pause(message)
    }
    return undefined
  }

  private shouldPause(point: BreakpointPoint): boolean {
    return this.breakpoints.shouldPause(point)
  }
}
