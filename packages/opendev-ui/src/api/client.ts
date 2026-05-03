import type { Config, Message, Provider, Session } from '../types'
import { ApiError, deleteJson, getJson, postJson, putJson, requestRaw } from './core'

class APIClient {
  // 聊天相关接口
  async sendQuery(
    message: string,
    sessionId?: string,
  ): Promise<{ status: string; message: string }> {
    return postJson('/chat/query', { message, sessionId })
  }

  async getMessages(): Promise<Message[]> {
    return getJson('/chat/messages')
  }

  async clearChat(): Promise<{ status: string; message: string }> {
    return deleteJson('/chat/clear')
  }

  // 通用 GET 请求
  async get<T>(endpoint: string): Promise<T> {
    return getJson(endpoint)
  }

  async interruptTask(): Promise<{ status: string; message: string }> {
    return postJson('/chat/interrupt')
  }

  async cancelSubagentTask(taskId: string): Promise<{
    status: string
    message: string
    taskId: string
  }> {
    return postJson(`/chat/tasks/${encodeURIComponent(taskId)}/cancel`)
  }

  // Session 相关接口
  async listSessions(): Promise<Session[]> {
    return getJson('/sessions')
  }

  async getCurrentSession(): Promise<Session> {
    return getJson('/sessions/current')
  }

  async resumeSession(sessionId: string): Promise<{ status: string; message: string }> {
    return postJson(`/sessions/${sessionId}/resume`)
  }

  async exportSession(sessionId: string): Promise<unknown> {
    return getJson(`/sessions/${sessionId}/export`)
  }

  async verifyPath(
    path: string,
  ): Promise<{ exists: boolean; isDirectory: boolean; path?: string; error?: string }> {
    return postJson('/sessions/verify-path', { path })
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
    return postJson('/sessions/browse-directory', { path, showHidden })
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    try {
      return await getJson(`/sessions/${sessionId}/messages`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return []
      }
      throw error
    }
  }

  async createSession(
    workspace: string,
  ): Promise<{ status: string; message: string; session: Session }> {
    return postJson('/sessions', { workingDirectory: workspace })
  }

  async getSessionModel(sessionId: string): Promise<Record<string, string>> {
    return getJson(`/sessions/${sessionId}/model`)
  }

  async updateSessionModel(
    sessionId: string,
    overlay: Record<string, string | null>,
  ): Promise<{ status: string; message: string }> {
    return putJson(`/sessions/${sessionId}/model`, overlay)
  }

  async clearSessionModel(sessionId: string): Promise<{ status: string; message: string }> {
    return deleteJson(`/sessions/${sessionId}/model`)
  }

  async verifyModel(provider: string, model: string): Promise<{ valid: boolean; error?: string }> {
    return postJson('/setting/verify-model', { provider, model })
  }

  async getSetting(): Promise<Config> {
    return getJson('/setting')
  }

  async updateSetting(config: Partial<Config>): Promise<{ status: string; message: string }> {
    return putJson('/setting', config)
  }

  async listProviders(): Promise<Provider[]> {
    return getJson('/setting/providers')
  }

  async setMode(mode: string): Promise<{ status: string; message: string }> {
    return postJson('/setting/mode', { mode })
  }

  async setAutonomy(level: string): Promise<{ status: string; message: string }> {
    return postJson('/setting/autonomy', { level })
  }

  async setThinkingLevel(level: string): Promise<{ status: string; message: string }> {
    return postJson('/setting/thinking', { level })
  }

  async listFiles(
    query?: string,
  ): Promise<{ files: Array<{ path: string; name: string; isFile: boolean }> }> {
    const url = query ? `/sessions/files?query=${encodeURIComponent(query)}` : '/sessions/files'
    return getJson(url)
  }

  async getBridgeInfo(): Promise<{ bridgeMode: boolean; sessionId: string | null }> {
    const response = await requestRaw('/sessions/bridge-info')
    if (!response.ok) {
      return { bridgeMode: false, sessionId: null }
    }
    return response.json()
  }

  async health(): Promise<{ status: string; service: string }> {
    return getJson('/health')
  }
}

export const api = new APIClient()
