import type { Config, Message, Provider, Session } from '../types'

const API_BASE = '/api'

class APIClient {
  // Chat endpoints
  async sendQuery(
    message: string,
    sessionId?: string,
  ): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/chat/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async getMessages(): Promise<Message[]> {
    const response = await fetch(`${API_BASE}/chat/messages`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async clearChat(): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/chat/clear`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // 通用 GET 请求
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async interruptTask(): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/chat/interrupt`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // Session endpoints
  async listSessions(): Promise<Session[]> {
    const response = await fetch(`${API_BASE}/sessions`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async getCurrentSession(): Promise<Session> {
    const response = await fetch(`${API_BASE}/sessions/current`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async resumeSession(sessionId: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/resume`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async exportSession(sessionId: string): Promise<unknown> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/export`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async verifyPath(
    path: string,
  ): Promise<{ exists: boolean; isDirectory: boolean; path?: string; error?: string }> {
    const response = await fetch(`${API_BASE}/sessions/verify-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async browseDirectory(
    path = '',
    showHidden = false,
  ): Promise<{
    currentPath: string
    parentPath: string | null
    directories: Array<{ name: string; path: string }>
    error: string | null
  }> {
    const response = await fetch(`${API_BASE}/sessions/browse-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, showHidden }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/messages`)
    if (!response.ok) {
      if (response.status === 404) return []
      throw new Error(`API error: ${response.statusText}`)
    }
    return response.json()
  }

  async createSession(
    workspace: string,
  ): Promise<{ status: string; message: string; session: Session }> {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory: workspace }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // Session model endpoints
  async getSessionModel(sessionId: string): Promise<Record<string, string>> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/model`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async updateSessionModel(
    sessionId: string,
    overlay: Record<string, string | null>,
  ): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overlay),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async clearSessionModel(sessionId: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/model`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async verifyModel(provider: string, model: string): Promise<{ valid: boolean; error?: string }> {
    const response = await fetch(`${API_BASE}/setting/verify-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // 配置接口
  async getSetting(): Promise<Config> {
    const response = await fetch(`${API_BASE}/setting`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async updateSetting(config: Partial<Config>): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/setting`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async listProviders(): Promise<Provider[]> {
    const response = await fetch(`${API_BASE}/setting/providers`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async setMode(mode: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/setting/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async setAutonomy(level: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/setting/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async setThinkingLevel(level: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/setting/thinking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // File listing
  async listFiles(
    query?: string,
  ): Promise<{ files: Array<{ path: string; name: string; isFile: boolean }> }> {
    const url = query
      ? `${API_BASE}/sessions/files?query=${encodeURIComponent(query)}`
      : `${API_BASE}/sessions/files`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // Bridge mode
  async getBridgeInfo(): Promise<{ bridgeMode: boolean; sessionId: string | null }> {
    const response = await fetch(`${API_BASE}/sessions/bridge-info`)
    if (!response.ok) return { bridgeMode: false, sessionId: null }
    return response.json()
  }

  // Health check
  async health(): Promise<{ status: string; service: string }> {
    const response = await fetch(`${API_BASE}/health`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }
}

export const api = new APIClient()
