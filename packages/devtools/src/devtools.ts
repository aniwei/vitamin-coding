import { Server } from 'node:http'
import { DevtoolsService } from './service'
import { Breakpoints } from './tools/breakpoints'
import { DevtoolsDebugger } from './tools/debugger'
import { DevtoolsLogger } from './tools/logger'

interface DevtoolsOptions {
  port?: number
  server?: Server
  noServer?: boolean
}

export class Devtools {
  public readonly service: DevtoolsService
  private breakpoints: Breakpoints
  
  public debugger: DevtoolsDebugger
  public logger: DevtoolsLogger

  constructor(options: DevtoolsOptions) {
    const { port, server, noServer } = options
    this.breakpoints = new Breakpoints()

    this.service = new DevtoolsService({
      port: noServer ? undefined : (port || 0),
      server,
      noServer: !!noServer,
    }, this.breakpoints)

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

export const createDevtools = (options: DevtoolsOptions) => {
  const devtools = new Devtools(options)
  return devtools
}