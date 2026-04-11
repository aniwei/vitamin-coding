import { RemotePersistenceError } from './errors'
import type { PaginatedResult, Codec } from './types'

export interface RemotePersistenceOptions<S = unknown> {
  baseUrl: string
  getAuth: () => Promise<{ token: string }>
  getHeaders?: () => Promise<Record<string, string>>
  fetch: typeof globalThis.fetch
  timeoutMs: number
  defaultPageSize?: number
  defaultSortBy?: string
  codec?: Codec<S>
}

export abstract class RemotePersistence<S> {
  protected readonly baseUrl: string
  protected readonly getAuth: () => Promise<{ token: string }>
  protected readonly getHeaders: () => Promise<Record<string, string>>
  protected readonly fetch: typeof globalThis.fetch
  protected readonly timeoutMs: number
  protected readonly defaultPageSize: number
  protected readonly defaultSortBy: string
  protected readonly codec: Codec<S>

  constructor(options: RemotePersistenceOptions<S>) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')

    this.getAuth = options.getAuth
    this.getHeaders = options.getHeaders ?? (async () => ({}))
    this.fetch = options.fetch

    this.timeoutMs = options.timeoutMs
    this.defaultPageSize = options.defaultPageSize ?? 20
    this.defaultSortBy = options.defaultSortBy ?? 'updatedAt'
    this.codec = options.codec ?? {
      encode: (snapshot: S) => JSON.stringify(snapshot),
      decode: (payload: string) => JSON.parse(payload) as S,
      contentType: 'application/json',
    }
  }

  protected abstract extractId(snapshot: S): string

  async save(snapshot: S): Promise<void> {
    await this.request(`/${encodeURIComponent(this.extractId(snapshot))}`, {
      method: 'PUT',
      body: this.codec.encode(snapshot),
    })
  }

  async load(id: string): Promise<S | null> {
    const response = await this.request(`/${encodeURIComponent(id)}`, {
      method: 'GET',
    })

    if (response.status === 404) return null
    return this.codec.decode(await response.text())
  }

  async delete(id: string): Promise<boolean> {
    const response = await this.request(`/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    return response.ok
  }

  async list(): Promise<string[]> {
    const response = await this.request('', { method: 'GET' })
    const data = (await response.json()) as { ids: string[] }
    return data.ids
  }

  async listPaginated(options: {
    page: number
    pageSize?: number
    sortBy?: string
    order?: 'asc' | 'desc'
  }): Promise<PaginatedResult<string>> {
    const { page, order = 'desc' } = options
    const sortBy = options.sortBy ?? this.defaultSortBy
    const pageSize = options.pageSize ?? this.defaultPageSize

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      order,
    })

    const response = await this.request(`?${params.toString()}`, {
      method: 'GET',
    })

    return response.json() as Promise<PaginatedResult<string>>
  }

  protected async request(
    path: string,
    init: { method: string; body?: string },
  ): Promise<Response> {
    const auth = await this.getAuth()

    const headers: Record<string, string> = {
      ...(await this.getHeaders()),
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      Accept: 'application/json',
    }

    if (init.body) {
      headers['Content-Type'] = this.codec.contentType ?? 'application/json'
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
          `Remote persistence API error: ${response.status} ${response.statusText}`,
          response.status,
        )
      }

      return response
    } finally {
      clearTimeout(timeout)
    }
  }
}
