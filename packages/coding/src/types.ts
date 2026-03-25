import { createLogger } from '@vitamin/shared'
import { loadConfig } from '@vitamin/config'

export interface SystemContext {
  logger: ReturnType<typeof createLogger>
  config: Awaited<ReturnType<typeof loadConfig>>

  createSession: () => Promise<any>
  getSession: (id: string) => Promise<any>
  listSessions: () => Promise<any[]>
}