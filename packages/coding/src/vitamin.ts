
import { Devtools } from '@vitamin/devtools'
import { createLogger } from '@vitamin/shared'
import { loadConfig } from '@vitamin/config'
import { 
  attachLogListener
} from '@vitamin/shared'
import type { SystemContext } from './types'

interface VitaminAppOptions {
  port: number
  inspect: boolean
  logger: {
    name: string
    level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal'
    destination: string
  }
}


class VitaminApp implements SystemContext {
  private devtools: Devtools | null = null
  private globalLogSubscription: ReturnType<typeof attachLogListener> | null = null

  public config: Awaited<ReturnType<typeof loadConfig>>
  public logger: ReturnType<typeof createLogger> 

  public sessions: any

  constructor(
    options: VitaminAppOptions
  ) {
    if (options.inspect) {
      this.devtools = new Devtools(options.port)

      this.globalLogSubscription = attachLogListener((data) => {
        const log = data as { name: string, level: string, msg: string }
        if (log.name === 'vitamin-app') {
          this.devtools?.logger.publish(log)
        }
      })
    }

    this.logger = createLogger(options.logger.name, {
      level: options.logger.level,
      destination: options.logger.destination
    })

    this.config = {} as Awaited<ReturnType<typeof loadConfig>>
  }

  async createSession () {
    throw new Error('Not implemented')
  }
  
  async getSession (id: string) {
    throw new Error('Not implemented')
  }

  async listSessions () {
    throw new Error('Not implemented')
  }

  async start() {
    this.config = await loadConfig()

    if (this.devtools) {
      await this.devtools.start()
    }
  }

  async stop() {
    if (this.devtools) {
      await this.devtools.stop()

      if (this.globalLogSubscription) {
        this.globalLogSubscription()
        this.globalLogSubscription = null
      }
    }
  }
}

export function createVitamin(options: VitaminAppOptions): VitaminApp {
  const v = new VitaminApp(options)
  return v
}