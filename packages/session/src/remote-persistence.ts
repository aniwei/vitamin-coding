import type { PaginatedResult, PaginationOptions, SessionPersistence, SessionSnapshot } from './types'

const DEFAULT_PAGE_SIZE = 50

export interface RemoteSessionPersistenceOptions {
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  fetch: typeof globalThis.fetch
  timeoutMs?: number
}

export class RemoteSessionPersistence<T = unknown> implements SessionPersistence<T> {
  private readonly baseUrl: string
  private readonly getAuth: () => Promise<{ token: string }>
  private readonly fetch: typeof globalThis.fetch
  private readonly timeoutMs: number

  constructor(options: RemoteSessionPersistenceOptions) {
    // 移除尾部斜杠
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.getAuth = options.getAuth
    this.fetch = options.fetch
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  async save(snapshot: SessionSnapshot<T>): Promise<void> {
    await this.request(`/${encodeURIComponent(snapshot.id)}`, {
      method: 'PUT',
      body: JSON.stringify(snapshot),
    })
  }

  async load(id: string): Promise<SessionSnapshot<T> | null> {
    const response = await this.request(`/${encodeURIComponent(id)}`, {
      method: 'GET',
    })

    if (response.status === 404) return null
    return response.json() as Promise<SessionSnapshot<T>>
  }

  async delete(id: string): Promise<boolean> {
    const response = await this.request(`/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    return response.ok
  }

  async list(): Promise<string[]> {
    const response = await this.request('', { method: 'GET' })
    const data = await response.json() as { ids: string[] }
    return data.ids
  }

  async listPaginated(options: PaginationOptions): Promise<PaginatedResult<string>> {
    const { page, order = 'desc', sortBy = 'lastActiveAt' } = options
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      order,
    })

    const response = await this.request(`?${params.toString()}`, { method: 'GET' })
    return response.json() as Promise<PaginatedResult<string>>
  }

  private async request(
    path: string,
    init: { method: string; body?: string },
  ): Promise<Response> {
    const auth = await this.getAuth()

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${auth.token}`,
      'Accept': 'application/json',
    }

    if (init.body) {
      headers['Content-Type'] = 'application/json'
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: controller.signal,
      })

      if (!response.ok && response.status !== 404) {
        throw new RemotePersistenceError(
          `Remote session API error: ${response.status} ${response.statusText}`,
          response.status,
        )
      }

      return response
    } finally {
      clearTimeout(timeout)
    }
  }
}

export class RemotePersistenceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'RemotePersistenceError'
  }
}
