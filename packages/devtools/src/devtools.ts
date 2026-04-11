import { Service } from './service'
import { Breakpoints } from './tools/breakpoints'
import { Debugger } from './tools/debugger'
import { Logger } from './tools/logger'

interface DevtoolsOptions {
  port?: number
}

export class Devtools {
  public readonly service: Service
  private breakpoints: Breakpoints

  public debugger: Debugger
  public logger: Logger

  constructor(options: DevtoolsOptions = {}) {
    this.breakpoints = new Breakpoints()

    this.service = new Service(this.breakpoints, {
      port: options.port,
    })

    this.debugger = new Debugger(this.service, this.breakpoints)
    this.logger = new Logger(this.service)
  }

  start() {
    return this.service.start()
  }

  stop() {
    return this.service.stop()
  }
}

export const createDevtools = (options: DevtoolsOptions) => {
  const devtools = new Devtools(options)
  return devtools
}
