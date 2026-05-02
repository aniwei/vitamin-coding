import { normalizeKeysToCamel } from '@x-mars/shared/browser/data'

export const API_BASE = '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestJsonOptions extends RequestInit {
  normalizeCamel?: boolean
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined)
}

async function throwApiError(response: Response): Promise<never> {
  const body = await parseJson(response)
  const message =
    body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
      ? body.message
      : `API error: ${response.statusText}`
  throw new ApiError(message, response.status, response.statusText, body)
}

export async function requestJson<T>(path: string, options: RequestJsonOptions = {}): Promise<T> {
  const { normalizeCamel = false, headers, ...init } = options
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    await throwApiError(response)
  }

  const data = await parseJson(response)
  return normalizeCamel ? normalizeKeysToCamel<T>(data) : (data as T)
}

export async function requestRaw(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, options)
}

export function jsonHeaders(headers?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...headers,
  }
}

export function jsonBody<T>(body: T): string {
  return JSON.stringify(body)
}

export function getJson<T>(path: string, options?: RequestJsonOptions): Promise<T> {
  return requestJson<T>(path, options)
}

export function postJson<T>(
  path: string,
  body?: unknown,
  options: RequestJsonOptions = {},
): Promise<T> {
  return requestJson<T>(path, {
    ...options,
    method: 'POST',
    headers: jsonHeaders(options.headers),
    ...(body === undefined ? {} : { body: jsonBody(body) }),
  })
}

export function putJson<T>(
  path: string,
  body?: unknown,
  options: RequestJsonOptions = {},
): Promise<T> {
  return requestJson<T>(path, {
    ...options,
    method: 'PUT',
    headers: jsonHeaders(options.headers),
    ...(body === undefined ? {} : { body: jsonBody(body) }),
  })
}

export function deleteJson<T>(path: string, options?: RequestJsonOptions): Promise<T> {
  return requestJson<T>(path, { ...options, method: 'DELETE' })
}
