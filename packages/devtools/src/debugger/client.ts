import { TypedEventEmitter } from '@vitamin/shared'
import { createLogger } from '@vitamin/shared'
import type { DevtoolsEvents } from '../types'


const logger = createLogger('@vitamin/devtools:client')

interface DebuggerClientEvents {
  [key: string]: (...args: never[]) => void
}

export interface IncomingMessage<T = unknown> {
  service: string // http://localhost:3000/services/:serviceId/debugger
  type: DevtoolsEvents
  payload: T
}


export class DebuggerClient extends TypedEventEmitter<DebuggerClientEvents> {
  private buffer = Buffer.alloc(0)

  constructor() {
    super()
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', this.onStdinData)
    process.stdin.on('end', this.onStdinEnd)
    
  }

  onStdinData = (data: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, data])
  }

  onStdinEnd = () => {
    try {
      const message = JSON.parse(this.buffer.toString()) as IncomingMessage

      switch (message.type as unknown as keyof DevtoolsEvents) {
        case 'Debugger.paused':
          this.pause(message).then(() => {

          }).catch(() => {

          })
          break
        default:
          logger.warn({ type: message.type }, 'Received unknown message type from debugger controller')
      }

      logger.debug({ message }, 'Received message from debugger controller')
    } catch (error) {
      logger.error({ error }, 'Failed to parse message from debugger controller')
    }
  }

  async pause(message: IncomingMessage) {
    return fetch(message.service, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })
  }
}

new DebuggerClient()