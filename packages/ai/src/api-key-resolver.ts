// API Key 解析器 — 多策略 Key 获取
// 优先级: 显式传入 > 环境变量 > 配置文件

import { ProviderError } from '@vitamin/shared'

import { readCopilotOAuthToken } from './copilot-auth'

import type { Provider } from './types'

// 环境变量到 Provider 的映射
const ENV_KEY_MAP: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_API_KEY'],
  'amazon-bedrock': ['AWS_ACCESS_KEY_ID'],
  'github-copilot': ['GITHUB_TOKEN', 'GH_TOKEN', 'COPILOT_API_KEY', 'GITHUB_COPILOT_TOKEN'],
  xai: ['XAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  ollama: [], // Ollama 无需 Key
}

// API Key 获取回调
export type ApiKeyGetter = (provider: string) => Promise<string | undefined>

// API Key 解析器选项
export interface ApiKeyResolverOptions {
  // 静态 Key 映射
  keys?: Record<string, string>
  // 动态获取回调
  getApiKey?: ApiKeyGetter
}

// 解析 API Key
export async function resolveApiKey(
  provider: Provider,
  options?: ApiKeyResolverOptions,
  explicitKey?: string,
): Promise<string> {
  // 显式传入
  if (explicitKey) return explicitKey

  // 等级 2: 动态回调
  if (options?.getApiKey) {
    const key = await options.getApiKey(provider)
    if (key) return key
  }

  // 等级 3: 静态映射
  if (options?.keys?.[provider]) {
    return options.keys[provider]
  }

  // 等级 4: 环境变量
  const envVars = ENV_KEY_MAP[provider]
  if (envVars && envVars.length > 0) {
    for (const envVar of envVars) {
      const envValue = process.env[envVar]
      if (envValue) return envValue
    }
  }

  if (provider === 'github-copilot') {
    const ghToken = await readGithubCliToken()
    if (ghToken) return ghToken
  }

  // 等级 5: Copilot OAuth 本地存储（对齐 opencode 的 auth 存储行为）
  if (provider === 'github-copilot') {
    const oauthToken = await readCopilotOAuthToken()
    if (oauthToken) return oauthToken
  }

  // Ollama 无需 Key
  if (provider === 'ollama') return ''

  throw new ProviderError(`API key not found for provider: ${provider}`, {
    code: 'PROVIDER_NO_API_KEY',
  })
}

async function readGithubCliToken(): Promise<string | undefined> {
  try {
    const { execFileSync } = await import('node:child_process')
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return token.length > 0 ? token : undefined
  } catch {
    return undefined
  }
}
