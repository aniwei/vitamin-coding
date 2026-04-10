import { APIClient } from './client'

export class WorkspaceService extends APIClient {
  async browse(
    path = '',
    showHidden = false,
  ): Promise<{
    currentPath: string
    parentPath: string | null
    directories: Array<{ name: string; path: string }>
    error: string | null
  }> {
    const response = await fetch(`api/workspace/browse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, showHidden }),
    })

    if (!response.ok) throw new Error(`API error: ${response.statusText}`)
    return response.json()
  }
}

export const workspace = new WorkspaceService()
