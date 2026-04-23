import type { 
  Provider, 
  Session 
} from '../types'

export abstract class APIClient {
    // 通用 GET 请求
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`api/${endpoint}`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async post<T>(endpoint: string, body: any): Promise<T> {
    const response = await fetch(`api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async health(): Promise<{ status: string; service: string }> {
    const response = await fetch(`api/health`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }
}

