import { DevtoolsService, createDevtoolsService } from './service'
import { DevtoolsDebugger } from './tools/debugger'
import { DevtoolsLogger } from './tools/logger'

export class Devtools {
  private service: DevtoolsService
  
  public debugger: DevtoolsDebugger
  public logger: DevtoolsLogger

  constructor(port: number) {
    this.service = createDevtoolsService(port)
    this.debugger = new DevtoolsDebugger(this.service.serviceUrl)
    this.logger = new DevtoolsLogger(this.service.serviceUrl)
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