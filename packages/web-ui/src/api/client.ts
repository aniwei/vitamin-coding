import type { Config, Message, Provider, Session } from '../types'

const API_BASE = '/api'

type RawSession = Partial<Session> & {
  createdAt?: string
  updatedAt?: string
  workingDirectory?: string
  messageCount?: number
  hasSessionModel?: boolean
}

type RawConfig = Partial<Config> & {
  provider?: string | null
  workingDirectory?: string
}

type RawSessionModel = Record<string, string | null | undefined> & {
  id?: string | null
  provider?: string | null
}

function normalizeSession(raw: RawSession): Session {
  const created_at = raw.created_at ?? raw.createdAt ?? ''
  const updated_at = raw.updated_at ?? raw.updatedAt ?? created_at
  const working_directory = raw.working_directory ?? raw.workingDirectory ?? raw.working_dir

  return {
    id: raw.id ?? '',
    working_dir: raw.working_dir,
    working_directory,
    created_at,
    updated_at,
    message_count: raw.message_count ?? raw.messageCount ?? 0,
    token_usage: raw.token_usage,
    title: raw.title,
    status: raw.status,
    has_session_model: raw.has_session_model ?? raw.hasSessionModel,
  }
}

function normalizeConfig(raw: RawConfig): Config {
  const working_directory = raw.working_directory ?? raw.workingDirectory ?? raw.working_dir ?? ''

  return {
    model_provider: raw.model_provider ?? raw.provider ?? '',
    model: raw.model ?? '',
    api_key: raw.api_key ?? null,
    temperature: raw.temperature ?? 0,
    enable_bash: raw.enable_bash ?? false,
    working_directory,
    working_dir: raw.working_dir ?? working_directory,
    mode: raw.mode,
    autonomy_level: raw.autonomy_level,
    thinking_level: raw.thinking_level,
    git_branch: raw.git_branch ?? null,
    model_thinking_provider: raw.model_thinking_provider ?? null,
    model_thinking: raw.model_thinking ?? null,
    model_compact_provider: raw.model_compact_provider ?? null,
    model_compact: raw.model_compact ?? null,
    model_vlm_provider: raw.model_vlm_provider ?? null,
    model_vlm: raw.model_vlm ?? null,
  }
}

function normalizeSessionModel(raw: RawSessionModel): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      normalized[key] = value
    }
  }

  if (!normalized.model && typeof raw.id === 'string') {
    normalized.model = raw.id
  }

  if (!normalized.model_provider && typeof raw.provider === 'string') {
    normalized.model_provider = raw.provider
  }

  return normalized
}

class APIClient {
  // Chat endpoints
  async sendQuery(
    message: string,
    sessionId?: string,
  ): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/chat/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, session_id: sessionId }),
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
    const data = (await response.json()) as RawSession[]
    return data.map(normalizeSession)
  }

  async getCurrentSession(): Promise<Session> {
    const response = await fetch(`${API_BASE}/sessions/current`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return normalizeSession((await response.json()) as RawSession)
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
  ): Promise<{ exists: boolean; is_directory: boolean; path?: string; error?: string }> {
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
    current_path: string
    parent_path: string | null
    directories: Array<{ name: string; path: string }>
    error: string | null
  }> {
    const response = await fetch(`${API_BASE}/sessions/browse-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, show_hidden: showHidden }),
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
  ): Promise<{ status: string; message: string; session?: Session; id?: string }> {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ working_directory: workspace }),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    const data = (await response.json()) as {
      status: string
      message: string
      session?: RawSession
      id?: string
    }

    return {
      ...data,
      session: data.session ? normalizeSession(data.session) : undefined,
    }
  }

  // Session model endpoints
  async getSessionModel(sessionId: string): Promise<Record<string, string>> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/model`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return normalizeSessionModel((await response.json()) as RawSessionModel)
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
    return normalizeConfig((await response.json()) as RawConfig)
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
  ): Promise<{ files: Array<{ path: string; name: string; is_file: boolean }> }> {
    const url = query
      ? `${API_BASE}/sessions/files?query=${encodeURIComponent(query)}`
      : `${API_BASE}/sessions/files`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  // Bridge mode
  async getBridgeInfo(): Promise<{ bridge_mode: boolean; session_id: string | null }> {
    const response = await fetch(`${API_BASE}/sessions/bridge-info`)
    if (!response.ok) return { bridge_mode: false, session_id: null }
    const data = (await response.json()) as {
      bridge_mode?: boolean
      session_id?: string | null
      sessionId?: string | null
    }

    return {
      bridge_mode: data.bridge_mode === true,
      session_id: data.session_id ?? data.sessionId ?? null,
    }
  }

  // Health check
  async health(): Promise<{ status: string; service: string }> {
    const response = await fetch(`${API_BASE}/health`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }
}

export const api = new APIClient()
