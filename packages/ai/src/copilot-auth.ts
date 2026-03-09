import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface CopilotOAuthStore {
  type: 'oauth'
  refreshToken: string
  accessToken: string
  expires: number
}

function isCopilotOAuthRecord(value: unknown): value is CopilotOAuthRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.type === 'oauth' &&
    typeof record.access === 'string' &&
    typeof record.refresh === 'string' &&
    typeof record.expires === 'number'
  )
}

function getAuthFilePath(): string {
  const explicit = process.env['VITAMIN_AUTH_FILE']
  if (explicit) return explicit

  const xdgConfigHome = process.env['XDG_CONFIG_HOME']
  const configBase = xdgConfigHome && xdgConfigHome.trim().length > 0
    ? xdgConfigHome
    : join(homedir(), '.config')

  return join(configBase, 'vitamin', 'auth.json')
}

async function readAuthStore(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(getAuthFilePath(), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

export async function readCopilotOAuthToken(): Promise<string | undefined> {
  const store = await readAuthStore()

  const direct = store['github-copilot']
  if (isCopilotOAuthRecord(direct)) {
    return direct.access
  }

  const enterprise = store['github-copilot-enterprise']
  if (isCopilotOAuthRecord(enterprise)) {
    return enterprise.access
  }

  return undefined
}
