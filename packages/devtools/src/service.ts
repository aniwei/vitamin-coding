import { Server } from 'node:http'
import { v5 } from 'uuid'
import { Hono } from 'hono'
import { WebSocket, WebSocketServer } from 'ws'
import { createLogger, TypedEventEmitter } from '@vitamin/shared'
import { createDebuggerRoute, createLoggerRoute, createSessionRoute } from './routes'

const logger = createLogger('@vitamin/devtools:service')

interface DevtoolsServiceEvents {
  'Debugger.stepOver': () => void,
  [key: string]: () => void
}

export class DevtoolsService extends TypedEventEmitter<DevtoolsServiceEvents> {
  
  public get serviceUrl(): string {
    return `http://localhost:${this.port}/${this.id}`
  }
  
  private app: Hono
  private httpServer: Server
  private wss: WebSocketServer
  private clients = new Set<WebSocket>()
  private id: string = v5('devtool-service', v5.URL)

  constructor(private readonly port: number) {
    super()
    const server = new Server()
    const wss = new WebSocketServer({ server })

    wss.on('connection', this.onConnection)
    wss.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error')
    })

    server.on('error', (error) => {
      logger.error({ error }, 'HTTP server error')
    })

    this.wss = wss
    this.app = new Hono()
    this.httpServer = server
  }

  onConnection = (ws: WebSocket) => {
    this.clients.add(ws)
    ws.on('close', () => {
      this.clients.delete(ws)
    })
  }

  broadcast(message: string): void {
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    })
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      const app = this.app

      app.route(`/${this.id}/command/logger`, createLoggerRoute(this)) 
      app.route(`/${this.id}/command/debugger`, createDebuggerRoute(this))
      app.route(`/${this.id}/command/session`, createSessionRoute(this))

      this.httpServer.on('request', this.app.fetch)
      this.httpServer.listen(this.port, () => {
        logger.info(`Agent debug service started on port ${this.port}, service ID: ${this.id}`)
        resolve()
      })
    })
  }

  stop(): void {
    this.wss.close()
    
    this.httpServer.close(() => logger.info('Agent debug service stopped'))
    this.clients.forEach((client) => client.close())
    this.clients.clear()
  }
}

export const createDevtoolsService = (port: number) => {
  const service = new DevtoolsService(port)
  return service
}