import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createLogger } from '@vitamin/shared'

const logger = createLogger('@vitamin/devtools:debugger')

function resolvePath(): string {
  return fileURLToPath(new URL('./agent.js', import.meta.url))
}

export class DevtoolsDebugger {
  private serviceUrl: string

  constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl
  }

  pause(message: any) {
    logger.debug({ message }, 'Debugger paused')

    execFileSync('node', [resolvePath()], {
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