/**
 * GitHub Copilot OAuth flow — 参照 pi-mono 模式
 * 无状态设计：凭据通过参数传入/返回，不内部持有状态
 */

import { createLogger, OAuthError } from '@vitamin/shared'
import type { Api, Model, OAuthCredentials, OAuthLoginCallbacks, OAuthProvider } from '../types'

const logger = createLogger('@vitamin/ai:oauth:github-copilot')

// VS Code 注册的 GitHub OAuth App client id（与 pi-mono 一致，混淆处理）
const decode = (s: string) => atob(s)
const GITHUB_CLIENT_ID = decode('SXYxLmI1MDdhMDhjODdlY2ZlOTg=')
const GITHUB_SCOPE = 'read:user'

const COPILOT_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
} as const

const INITIAL_POLL_MULTIPLIER = 1.2
const SLOW_DOWN_POLL_MULTIPLIER = 1.4

type CopilotCredentials = OAuthCredentials & {
  enterpriseUrl?: string
}

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

// 标准化 enterprise domain 
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    return url.hostname
  } catch {
    return null
  }
}

function getUrls(domain: string) {
  return {
    deviceCodeUrl: `https://${domain}/login/device/code`,
    accessTokenUrl: `https://${domain}/login/oauth/access_token`,
    copilotTokenUrl: `https://api.${domain}/copilot_internal/v2/token`,
  }
}

// 从 Copilot token 的 proxy-ep 字段解析 API base URL
// Token 格式: tid=...;exp=...;proxy-ep=proxy.individual.githubcopilot.com;...
function getBaseUrlFromToken(token: string): string | null {
  const match = token.match(/proxy-ep=([^;]+)/)
  if (!match?.[1]) return null
  const apiHost = match[1].replace(/^proxy\./, 'api.')
  return `https://${apiHost}`
}

// 获取 Copilot API 基础 URL
export function getGitHubCopilotBaseUrl(token?: string, enterpriseDomain?: string): string {
  if (token) {
    const urlFromToken = getBaseUrlFromToken(token)
    if (urlFromToken) return urlFromToken
  }

  if (enterpriseDomain) return `https://copilot-api.${enterpriseDomain}`
  return 'https://api.individual.githubcopilot.com'
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const text = await response.text()
    throw new OAuthError(`${response.status} ${response.statusText}: ${text}`, {
      code: 'OAUTH_FETCH_FAILED',
    })
  }
  return response.json()
}

async function startDeviceFlow(domain: string): Promise<DeviceCodeResponse> {
  const urls = getUrls(domain)
  const data = await fetchJson(urls.deviceCodeUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': COPILOT_HEADERS['User-Agent'],
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPE,
    }),
  }) as Record<string, unknown>

  const deviceCode = data.device_code
  const userCode = data.user_code
  const verificationUri = data.verification_uri
  const interval = data.interval
  const expiresIn = data.expires_in

  if (
    typeof deviceCode !== 'string'
    || typeof userCode !== 'string'
    || typeof verificationUri !== 'string'
    || typeof interval !== 'number'
    || typeof expiresIn !== 'number'
  ) {
    throw new OAuthError('GitHub device authorization returned invalid response fields.', {
      code: 'OAUTH_AUTHORIZE_FAILED',
    })
  }

  return { 
    device_code: deviceCode, 
    user_code: userCode, 
    verification_uri: verificationUri, 
    interval, 
    expires_in: expiresIn 
  }
}

// 支持 AbortSignal 的 sleep
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' }))
      return
    }

    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' }))
    }, { once: true })
  })
}

async function pollForGitHubAccessToken(
  domain: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<string> {
  const urls = getUrls(domain)
  const deadline = Date.now() + expiresIn * 1000
  let intervalMs = Math.max(1000, Math.floor(intervalSeconds * 1000))
  let multiplier = INITIAL_POLL_MULTIPLIER
  let slowDownResponses = 0

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' })
    }

    const remain = deadline - Date.now()
    const waitMs = Math.min(Math.ceil(intervalMs * multiplier), remain)
    await abortableSleep(waitMs, signal)

    const raw = await fetchJson(urls.accessTokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': COPILOT_HEADERS['User-Agent'],
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    }) as Record<string, unknown>

    if (typeof raw.access_token === 'string') {
      return raw.access_token
    }

    if (typeof raw.error === 'string') {
      const error = raw.error as string
      if (error === 'authorization_pending') continue

      if (error === 'slow_down') {
        slowDownResponses += 1
        intervalMs = typeof raw.interval === 'number' && raw.interval > 0
          ? raw.interval * 1000
          : Math.max(1000, intervalMs + 5000)
        multiplier = SLOW_DOWN_POLL_MULTIPLIER
        continue
      }

      const desc = typeof raw.error_description === 'string' ? `: ${raw.error_description}` : ''
      throw new OAuthError(`Device flow failed: ${error}${desc}`, {
        code: 'OAUTH_AUTHORIZE_FAILED',
      })
    }
  }

  if (slowDownResponses > 0) {
    throw new OAuthError(
      'Device flow timed out after one or more slow_down responses. This is often caused by clock drift in WSL or VM environments. Please sync or restart the VM clock and try again.',
      { code: 'OAUTH_AUTHORIZE_TIMEOUT' },
    )
  }

  throw new OAuthError('Timed out while waiting for GitHub device authorization.', {
    code: 'OAUTH_AUTHORIZE_TIMEOUT',
  })
}

// ────────────────────────────────────────────────────────────────
// 公开 API
// ────────────────────────────────────────────────────────────────

/**
 * 刷新 GitHub Copilot token
 * @param refreshToken  GitHub OAuth access_token
 * @param enterpriseDomain  可选 GHE 域名
 */
export async function refreshGitHubCopilotToken(
  refreshToken: string,
  enterpriseDomain?: string,
): Promise<OAuthCredentials> {
  const domain = enterpriseDomain || 'github.com'
  const urls = getUrls(domain)

  const raw = await fetchJson(urls.copilotTokenUrl, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${refreshToken}`,
      ...COPILOT_HEADERS,
    },
  }) as Record<string, unknown>

  const token = raw.token
  const expiresAt = raw.expires_at

  if (typeof token !== 'string' || typeof expiresAt !== 'number') {
    throw new OAuthError('Invalid Copilot token response fields.', {
      code: 'OAUTH_REFRESH_FAILED',
    })
  }

  return {
    refresh: refreshToken,
    access: token,
    expires: expiresAt * 1000 - 5 * 60 * 1000, // 提前 5 分钟过期
    enterpriseUrl: enterpriseDomain,
  }
}

/**
 * 启用单个 GitHub Copilot 模型的策略（部分模型如 Claude、Grok 等需要先接受策略才能使用）
 */
export async function enableGitHubCopilotModel(
  token: string,
  modelId: string,
  enterpriseDomain?: string,
): Promise<boolean> {
  const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseDomain)
  const url = `${baseUrl}/models/${modelId}/policy`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...COPILOT_HEADERS,
        'openai-intent': 'chat-policy',
        'x-interaction-type': 'chat-policy',
      },
      body: JSON.stringify({ state: 'enabled' }),
    })
    return response.ok
  } catch {
    return false
  }
}

// 启用所有已知 GitHub Copilot 模型（登录后调用以确保所有模型可用）
// 通过 Copilot models API 获取模型列表并逐一启用
export async function enableAllGitHubCopilotModels(
  token: string,
  enterpriseDomain?: string,
  onProgress?: (modelId: string, success: boolean) => void,
): Promise<void> {
  const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseDomain)

  // 从 Copilot API 获取可用模型列表
  let modelIds: string[] = []
  try {
    const data = await fetchJson(`${baseUrl}/models`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...COPILOT_HEADERS,
      },
    }) as { data?: Array<{ id: string }> }
    modelIds = data.data?.map(m => m.id) ?? []
  } catch {
    logger.warn('Failed to fetch Copilot models list, skipping model enablement')
    return
  }

  await Promise.all(
    modelIds.map(async (modelId) => {
      const success = await enableGitHubCopilotModel(token, modelId, enterpriseDomain)
      onProgress?.(modelId, success)
    }),
  )
}

// 完整的 GitHub Copilot 登录流程（device code flow）
export async function loginGitHubCopilot(options: {
  onAuth: (url: string, instructions?: string) => void
  onPrompt: (prompt: { message: string, placeholder?: string, allowEmpty?: boolean }) => Promise<string>
  onProgress?: (message: string) => void
  signal?: AbortSignal
}): Promise<OAuthCredentials> {
  const input = await options.onPrompt({
    message: 'GitHub Enterprise URL/domain (blank for github.com)',
    placeholder: 'company.ghe.com',
    allowEmpty: true,
  })

  if (options.signal?.aborted) {
    throw new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' })
  }

  const trimmed = input.trim()
  const enterpriseDomain = normalizeDomain(input)
  if (trimmed && !enterpriseDomain) {
    throw new OAuthError('Invalid GitHub Enterprise URL/domain', {
      code: 'OAUTH_AUTHORIZE_FAILED',
    })
  }
  const domain = enterpriseDomain || 'github.com'

  const device = await startDeviceFlow(domain)
  options.onAuth(device.verification_uri, `Enter code: ${device.user_code}`)

  const githubAccessToken = await pollForGitHubAccessToken(
    domain,
    device.device_code,
    device.interval,
    device.expires_in,
    options.signal,
  )

  const credentials = await refreshGitHubCopilotToken(
    githubAccessToken,
    enterpriseDomain ?? undefined,
  )

  // 登录后启用所有模型（部分模型需要先接受策略才能使用）
  options.onProgress?.('Enabling models...')
  await enableAllGitHubCopilotModels(credentials.access, enterpriseDomain ?? undefined)

  logger.info('GitHub Copilot OAuth login completed')
  return credentials
}

export const githubCopilotOAuthProvider: OAuthProvider = {
  id: 'github-copilot',
  name: 'GitHub Copilot',

  async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
    return loginGitHubCopilot({
      onAuth: (url, instructions) => callbacks.onAuth({ url, instructions }),
      onPrompt: callbacks.onPrompt,
      onProgress: callbacks.onProgress,
      signal: callbacks.signal,
    })
  },

  async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const creds = credentials as CopilotCredentials
    return refreshGitHubCopilotToken(creds.refresh, creds.enterpriseUrl)
  },

  getApiKey(credentials: OAuthCredentials): string {
    return credentials.access
  },

  modifyModels(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[] {
    const creds = credentials as CopilotCredentials
    const domain = creds.enterpriseUrl
      ? (normalizeDomain(creds.enterpriseUrl) ?? undefined)
      : undefined

    const baseUrl = getGitHubCopilotBaseUrl(creds.access, domain)
    return models.map((m) => (m.provider === 'github-copilot' ? { ...m, baseUrl } : m))
  },
}