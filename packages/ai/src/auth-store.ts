
// AuthStore — 统一凭据存储层
// 支持两种凭据类型：
//   - api_key  : 直接存储 API key 字符串（OpenAI / Anthropic / 等）
//   - oauth    : 存储 OAuth 凭据（refresh / access / expires），支持自动刷新
// Key 解析优先级（每次 getCredentialKey() 调用）：
//   1. cache 中已有条目（含 runtimeSet 的临时 key 和文件已加载的持久化 key）
//   2. 环境变量 fallback（env 映射）
//   3. 返回 null → 上层触发认证流程
// 持久化文件默认路径：~/.vitamin/auth.json
// 文件权限：0o600（仅当前用户可读）
import { createLogger } from '@vitamin/shared'
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AUTH_PATH } from '@vitamin/env'
import { 
  OAuthRegistry, 
  createDefaultOAuthRegistry 
} from './oauth-registry'

import type { OAuthCredentials, OAuthLoginOptions, Provider } from './types'

export type ApiKeyEntry = {
  type: 'api_key'
  key: string
}

export type OAuthEntry = {
  type: 'oauth'
} & OAuthCredentials

export type AuthEntry = ApiKeyEntry | OAuthEntry

// auth.json 文件的顶层结构：{ provider: AuthEntry }
export type AuthFileData = Record<string, AuthEntry>

export interface AuthStoreOptions {
  // 凭据文件路径，默认 ~/.vitamin/auth.json
  path?: string

  // provider → 环境变量名 的 fallback 映射
  // @example { 'openai': 'OPENAI_API_KEY', 'anthropic': 'ANTHROPIC_API_KEY' }
  env?: Record<string, string>

  // OAuth 提供商适配器注册表（无状态协议层）
  // 默认使用 createDefaultOAuthRegistry()，已预注册 GitHubCopilotOAuthProvider
  oauth?: OAuthRegistry
}

const logger = createLogger('@vitamin/ai:auth-store')

export class AuthStore {
  // 统一凭据缓存：运行时临时 key 和持久化 key 均存于此
  private readonly cache = new Map<string, AuthEntry>()
  private loaded = false
  private dirty = false

  // OAuth 协议层（无状态）：知道「怎么登录/刷新」
  // 凭据状态（有状态）由 cache + 文件 管理
  readonly oauth: OAuthRegistry

  readonly path: string
  private readonly env: Map<string, string>

  constructor(options: AuthStoreOptions = {}) {
    this.path = options.path ?? AUTH_PATH
    this.env = new Map(Object.entries(options.env ?? {}))
    this.oauth = options.oauth ?? createDefaultOAuthRegistry()
  }

  // 按优先级解析指定 provider 的 access key。
  // 返回 null 表示无任何可用凭据 → 上层应触发 login / setup 流程。
  async getCredentialKey(provider: Provider): Promise<string | null> {
    // cache 中已有条目（runtime key 或已加载的文件条目）
    await this.ensureInitialized()
    const entry = this.cache.get(provider)

    if (entry?.type === 'api_key') return entry.key
    if (entry?.type === 'oauth') return this.resolveOAuthAccessKey(provider, entry)

    // 环境变量 fallback
    const env = this.env.get(provider)
    if (env) {
      const key = process.env[env]
      if (key) return key
    }

    return null
  }

  // 检查指定 provider 是否有可用凭据（快速检查，不做刷新）。
  // 用于启动时过滤无凭据的模型列表。
  async hasCredential(provider: Provider): Promise<boolean> {
    await this.ensureInitialized()
    if (this.cache.has(provider)) return true

    const env = this.env.get(provider)
    return !!(env && process.env[env])
  }

  async setCredentialKey(provider: Provider, credentials: string): void
  async setCredentialKey(provider: Provider, credentials: OAuthCredentials): void 
  async setCredentialKey(provider: Provider, credentials: string | OAuthCredentials): void {
    await this.ensureInitialized()

    this.cache.set(provider, typeof credentials === 'string' 
      ? { type: 'api_key', key: credentials } 
      : { type: 'oauth', ...credentials }
    )
    
    this.dirty = true
  }

  // 移除指定 provider 的凭据（写入内存缓存，需调用 save() 持久化）
  remove(provider: Provider): void {
    this.cache?.delete(provider)
    this.dirty = true
  }

  // 执行完整的 OAuth 登录流程并持久化凭据。
  // provider 必须已通过 registerOAuthProvider() 注册。
  // @example
  // await authStore.login('github-copilot', {
  //   onAuth: ({ url, code }) => showUserCode(url, code),
  //   onPrompt: async ({ message }) => promptUser(message),
  // })
  async login(
    provider: Provider,
    options: OAuthLoginOptions
  ): Promise<OAuthCredentials> {
    const oauth = this.oauth.get(provider)
    if (!oauth) {
      throw new Error(`No OAuth provider registered for: ${provider}`)
    }

    const credentials = await oauth.login(options)
    this.setCredentialKey(provider, credentials)
    await this.save()

    return credentials
  }

  // 登出：移除凭据并持久化
  async logout(provider: Provider): Promise<void> {
    this.remove(provider)
    await this.save()
  }

  // 将内存缓存写入 auth.json（自动创建目录，设置 0o600 权限）
  async save(): Promise<void> {
    if (!this.dirty) return

    const obj: AuthFileData = {}
    for (const [k, v] of this.cache) {
      obj[k] = v
    }

    const dir = dirname(this.path)
    await mkdir(dir, { recursive: true })
    await writeFile(this.path, JSON.stringify(obj, null, 2), 'utf-8')

    // 限制文件权限：仅当前用户可读写
    try {
      await chmod(this.path, 0o600)
    } catch { }

    this.dirty = false
  }

  // 是否有未持久化的变更
  get isDirty(): boolean {
    return this.dirty
  }

  // 解析 OAuth key，必要时自动刷新并回写
  private async resolveOAuthAccessKey(
    provider: Provider,
    entry: OAuthEntry,
  ): Promise<string | null> {
    const oauthProvider = this.oauth.get(provider)
    if (!oauthProvider) return null

    // token 未过期：直接取 access key
    if (Date.now() < entry.expires) {
      return oauthProvider.getAccessKey(entry)
    }

    // token 已过期：刷新，回写，持久化
    try {
      const refreshed = await oauthProvider.refreshToken(entry)
      this.cache.set(provider, { type: 'oauth', ...refreshed })
      this.dirty = true
      await this.save()
      return oauthProvider.getAccessKey(refreshed)
    } catch {
      // 刷新失败（网络错误等）→ 返回 null，上层可触发重新 login
      return null
    }
  }

  // 加载文件（lazy，仅首次调用）
  async ensureInitialized(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    try {
      const raw = await readFile(this.path, 'utf-8')
      const data = JSON.parse(raw) as Record<string, AuthEntry>
      for (const [k, v] of Object.entries(data)) {
        // 已存在于 cache（runtime key）的条目不被文件内容覆盖
        if (!this.cache.has(k)) {
          this.cache.set(k, v)
        }
      }
    } catch {
      logger.warn(`Failed to load auth data from ${this.path}`)
    }
  }
}

// 创建标准 AuthStore（磁盘持久化）
export function createAuthStore(options: AuthStoreOptions = {}): AuthStore {
  return new AuthStore(options)
}

// 创建带默认环境变量映射的 AuthStore
// 覆盖最常见的 provider → 环境变量名约定
export function createDefaultAuthStore(options: AuthStoreOptions = {}): AuthStore {
  return new AuthStore({
    env: {
      'anthropic':      'ANTHROPIC_API_KEY',
      'openai':         'OPENAI_API_KEY',
      'github-copilot': 'COPILOT_GITHUB_TOKEN',
      ...options.env,
    },
    ...options,
  })
}
