import { DevtoolsService } from './service'
import { Breakpoints } from './tools/breakpoints'
import { DevtoolsDebugger } from './tools/debugger'
import { DevtoolsLogger } from './tools/logger'

export class Devtools {
  private service: DevtoolsService
  private breakpoints: Breakpoints
  
  public debugger: DevtoolsDebugger
  public logger: DevtoolsLogger

  constructor(port: number) {
    this.breakpoints = new Breakpoints()
    this.service = new DevtoolsService(port, this.breakpoints)
    this.debugger = new DevtoolsDebugger(this.service, this.breakpoints)
    this.logger = new DevtoolsLogger(this.service)
  }

  start() {
    return this.service.start()
  }

  stop() {
    return this.service.stop()
  }
}

export const createDevtools = (port: number) => {
  const devtools = new Devtools(port)
  return devtools
}