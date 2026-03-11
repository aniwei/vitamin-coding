import { execFileSync } from 'node:child_process'
import { createLogger } from '@vitamin/shared'
import { resolveDebugClientPath } from './path'

const logger = createLogger('@vitamin/devtools:debugger')


export class DebuggerController {
  private serviceUrl: string

  constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl
  }

  paused(message: any) {
    logger.debug({ message }, 'Debugger paused')

    execFileSync('node', [resolveDebugClientPath()], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: process.env,
      input: JSON.stringify({ 
        serviceUrl: this.serviceUrl, 
        type: 'Debugger.paused',
        payload: message,
      })
    })    
  }
}