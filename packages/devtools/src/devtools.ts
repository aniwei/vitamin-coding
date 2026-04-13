import { Service } from './service'
import { Breakpoints } from './tools/breakpoints'
import { Debugger } from './tools/debugger'

interface DevtoolsOptions {
  port?: number
}

export class Devtools {
  public readonly service: Service
  public readonly debugger: Debugger
  private readonly breakpoints: Breakpoints

  constructor(options: DevtoolsOptions = {}) {
    this.breakpoints = new Breakpoints()
    this.service = new Service(this.breakpoints, { port: options.port })
    this.debugger = new Debugger(this.service, this.breakpoints)
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
}

export const createDevtools = (options: DevtoolsOptions) => {
  return new Devtools(options)
}
