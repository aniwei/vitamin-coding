import { Session } from '../types'
import { APIClient } from './client'

export class SessionService extends APIClient {

  async create(
    workspaceDir: string,
  ): Promise<{ status: string; message: string; session: Session }> {
    const response = await this.post<{ status: string; message: string; session: Session }>('sessions', { workspaceDir })
    return response
  }

  async current(): Promise<Session> {
    const response = await this.get<Session>('session/current')
    return response
  }

  async resume(sessionId: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`api/sessions/${sessionId}/resume`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async pause(sessionId: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`api/sessions/${sessionId}/pause`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async export(sessionId: string): Promise<unknown> {
    const response = await fetch(`api/sessions/${sessionId}/export`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }


  async getModel(sessionId: string): Promise<Record<string, string>> {
    const response = await this.get<Record<string, string>>(`session/${sessionId}/model`)
    return response
  }

  async updateModel(
    sessionId: string,
    overlay: Record<string, string | null>,
  ): Promise<{ status: string; message: string }> {
    const response = await fetch(`api/sessions/${sessionId}/model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overlay),
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async clearModel(sessionId: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`api/sessions/${sessionId}/model`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }

  async list(): Promise<Session[]> {
    const response = await fetch(`api/sessions`)
    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }
}

export const session = new SessionService()