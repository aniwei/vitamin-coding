import { DevtoolService } from './service'
import { DebuggerController } from './debugger'

export class Devtools extends DevtoolService {
  private controller: DebuggerController | null = null
  
  get debugger () {
    if (this.controller === null) {
      this.controller = new DebuggerController(`${this.serviceUrl}/debugger`)
    }

    return this.controller
  }
}

export const createDevtools = (port: number) => {
  const devtools = new Devtools(port)
  return devtools
}