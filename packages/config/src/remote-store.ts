import { createLogger } from '@vitamin/shared'
import type { ConfigStore, RemoteConfigStoreOptions } from './store'
import type { VitaminConfig } from './types'

const logger = createLogger('@vitamin/config:remote-store')

export class RemoteConfigStore implements ConfigStore {
  readonly type = 'remote' as const
  private readonly baseUrl: string
  private readonly getAuth?: () => Promise<{ token: string }>
  private readonly timeout: number
  private readonly fetch: typeof globalThis.fetch

  constructor(options: RemoteConfigStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.getAuth = options.getAuth
    this.timeout = options.timeout ?? 10_000
    this.fetch = options.fetch ?? globalThis.fetch
  }

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.getAuth) {
      const { token } = await this.getAuth()
      h['authorization'] = `Bearer ${token}`
    }
    return h
  }

  async read(path: string): Promise<string | undefined> {
    try {
      const response = await this.fetch(
        `${this.baseUrl}/config?path=${encodeURIComponent(path)}`,
        {
          method: 'GET',
          headers: await this.headers(),
          signal: AbortSignal.timeout(this.timeout),
        },
      )

      if (response.status === 404) return undefined
      if (!response.ok) {
        logger.warn({ status: response.status, path }, 'Remote config read failed')
        return undefined
      }

      const body = await response.json() as { content: string }
      return body.content
    } catch (error) {
      logger.warn({ path, err: error }, 'Remote config read error')
      return undefined
    }
  }

  async write(path: string, config: Partial<VitaminConfig>): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/config`,
      {
        method: 'PUT',
        headers: await this.headers(),
        body: JSON.stringify({ path, config }),
        signal: AbortSignal.timeout(this.timeout),
      },
    )

    if (!response.ok) {
      throw new Error(`Remote config write failed: ${response.status} ${response.statusText}`)
    }

    logger.debug({ path }, 'Config written to remote')
  }

  async exists(path: string): Promise<boolean> {
    try {
      const response = await this.fetch(
        `${this.baseUrl}/config?path=${encodeURIComponent(path)}`,
        {
          method: 'HEAD',
          headers: await this.headers(),
          signal: AbortSignal.timeout(this.timeout),
        },
      )
      return response.ok
    } catch {
      return false
    }
  }
}
