import { createLogger } from '@vitamin/shared'
import { Breakpoints, type Breakpoint } from './breakpoints'
import type { BreakpointPoint, DebugSnapshot } from '../protocol'
import type { DevtoolsService } from '../service'

const logger = createLogger('@vitamin/devtools:debugger')

export class DevtoolsDebugger {
  public readonly serviceUrl: string
  public readonly breakpoints: Breakpoints
  private readonly service: DevtoolsService

  constructor(service: DevtoolsService) {
    this.service = service
    this.serviceUrl = service.debuggerPauseUrl
    this.breakpoints = new Breakpoints()

    if (typeof service.registerDebuggerBreakpoints === 'function') {
      service.registerDebuggerBreakpoints({
        list: () => this.breakpoints.list(),
        set: (point, enabled) => this.breakpoints.set(point, enabled),
        enableAll: () => this.breakpoints.enableAll(),
        disableAll: () => this.breakpoints.disableAll(),
      })
    }
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

  
  pause(message: DebugSnapshot) {
    if (this.shouldPause(message.point)) {
      logger.debug({ message }, 'Pausing execution at breakpoint')
      return this.service.pause(message)
    }
  }
  
  private shouldPause(point: BreakpointPoint): boolean {
    return this.breakpoints.shouldPause(point)
  }
}