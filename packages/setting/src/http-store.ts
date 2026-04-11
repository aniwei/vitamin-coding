import { createLogger } from '@vitamin/shared'
import type { SettingStore, HttpSettingStoreOptions } from './store'
import type { VitaminSetting } from './types'

const logger = createLogger('@vitamin/setting:remote-store')

export class RemoteSettingStore implements SettingStore {
  readonly type = 'http' as const
  private readonly baseUrl: string
  private readonly getAuth?: () => Promise<{ token: string }>
  private readonly timeout: number
  private readonly fetch: typeof globalThis.fetch

  constructor(options: HttpSettingStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeout = options.timeoutMs ?? 10_000
    this.getAuth = options.getAuth
    this.fetch = options.fetch ?? globalThis.fetch
  }

  private async headers(): Promise<Record<string, string>> {
    const header: Record<string, string> = {
      'content-type': 'application/json',
    }

    if (this.getAuth) {
      const { token } = await this.getAuth()
      header['authorization'] = `Bearer ${token}`
    }
    return header
  }

  async read(path: string): Promise<string | undefined> {
    try {
      const response = await this.fetch(
        `${this.baseUrl}/setting?path=${encodeURIComponent(path)}`,
        {
          method: 'GET',
          headers: await this.headers(),
          signal: AbortSignal.timeout(this.timeout),
        },
      )

      if (response.status === 404) return undefined
      if (!response.ok) {
        logger.warn({ status: response.status, path }, 'Remote setting read failed')
        return undefined
      }

      const body = (await response.json()) as { content: string }
      return body.content
    } catch (error) {
      logger.warn({ path, err: error }, 'Remote setting read error')
      return undefined
    }
  }

  async write(path: string, setting: Partial<VitaminSetting>): Promise<void> {
    const response = await this.fetch(`${this.baseUrl}/setting`, {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify({ path, setting }),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      throw new Error(`Remote setting write failed: ${response.status} ${response.statusText}`)
    }

    logger.debug({ path }, 'Setting written to remote')
  }

  async exists(path: string): Promise<boolean> {
    try {
      const response = await this.fetch(
        `${this.baseUrl}/setting?path=${encodeURIComponent(path)}`,
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
