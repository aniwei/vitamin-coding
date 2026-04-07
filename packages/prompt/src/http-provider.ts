import type { RemoteProviderOptions, PromptEntry, PromptProvider } from './types'

export class HttpPromptProvider implements PromptProvider {
  private readonly baseUrl: string
  private readonly getAuth?: () => Promise<{ token: string }>
  private readonly getHeaders?: () => Promise<Record<string, string>>
  private readonly fetch: typeof globalThis.fetch
  private readonly timeoutMs: number

  constructor(options: Omit<RemoteProviderOptions, 'type'>) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.getAuth = options.getAuth
    this.getHeaders = options.getHeaders
    this.fetch = options.fetch ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async load(key: string): Promise<PromptEntry | null> {
    try {
      const response = await this.request(`/prompts/${encodeURIComponent(key)}`)
      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Remote prompt load failed: ${response.status}`)
      }
      return await response.json() as PromptEntry
    } catch {
      return null
    }
  }

  async list(): Promise<string[]> {
    const response = await this.request('/prompts')
    if (!response.ok) {
      throw new Error(`Remote prompt list failed: ${response.status}`)
    }
    return await response.json() as string[]
  }

  async loadMany(keys: string[]): Promise<Map<string, PromptEntry>> {
    const results = new Map<string, PromptEntry>()
    try {
      const response = await this.request('/prompts/batch', {
        method: 'POST',
        body: JSON.stringify({ keys }),
      })
      if (!response.ok) {
        throw new Error(`Remote prompt batch load failed: ${response.status}`)
      }
      const entries = await response.json() as PromptEntry[]
      for (const entry of entries) {
        results.set(entry.key, entry)
      }
    } catch {
      // fallback: load one by one
      const entries = await Promise.all(keys.map((k) => this.load(k)))
      for (const entry of entries) {
        if (entry) {
          results.set(entry.key, entry)
        }
      }
    }
    return results
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.getAuth) {
      const { token } = await this.getAuth()
      headers['Authorization'] = `Bearer ${token}`
    }
    if (this.getHeaders) {
      Object.assign(headers, await this.getHeaders())
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      return await this.fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...headers, ...init?.headers as Record<string, string> },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }
}
