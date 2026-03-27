import { readFile } from 'node:fs/promises'
import type { Api } from './types'

// 抽象接口：Access Key 解析器
// 支持两种来源：环境变量 / 本地文件
export interface AccessKeyResolver {
  resolve(api: Api): Promise<string | null>
}

// ─── 1. 环境变量解析器 ─────────────────────────────────────────────────────────
// api → 环境变量名 的映射表
// @example { 'openai-completions': 'OPENAI_API_KEY', 'anthropic-messages': 'ANTHROPIC_API_KEY' }
export type EnvKeyMap = Record<string, string>

// 从环境变量读取 API Key / Access Token
// 根据 envMap 将 api 名映射到对应的环境变量名，再从 process.env 读取值
export class EnvAccessKeyResolver implements AccessKeyResolver {
  private readonly envMap: Map<string, string>

  constructor(envMap: EnvKeyMap) {
    this.envMap = new Map(Object.entries(envMap))
  }

  async resolve(api: Api): Promise<string | null> {
    const varName = this.envMap.get(api)
    if (!varName) return null
    return process.env[varName] ?? null
  }
}

// ─── 2. 本地文件解析器 ─────────────────────────────────────────────────────────

// 本地凭据文件的 JSON 结构
// 顶层 key 为 api 名称，value 为对应的 API Key 或 Access Token 字符串
// @example
// {
//   "openai-completions": "sk-...",
//   "anthropic-messages": "sk-ant-...",
//   "github-copilot": "ghu_..."
// }
export type LocalKeyFile = Record<string, string>

export interface LocalFileAccessKeyResolverOptions {
  // 本地凭据文件的绝对路径（JSON 格式）
  filePath: string
}

// 从本地 JSON 文件读取 API Key / Access Token
// 每次 resolve 都重新读取文件，确保获取最新值（适合凭据文件热更新）
export class LocalFileAccessKeyResolver implements AccessKeyResolver {
  constructor(private readonly options: LocalFileAccessKeyResolverOptions) {}

  async resolve(api: Api): Promise<string | null> {
    let raw: string
    try {
      raw = await readFile(this.options.filePath, 'utf-8')
    } catch {
      return null
    }

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }

    if (typeof data !== 'object' || data === null) return null

    const key = (data as Record<string, unknown>)[api]
    if (typeof key !== 'string' || !key) return null

    return key
  }
}

// ─── 3. 链式解析器 ─────────────────────────────────────────────────────────────
// 按注册顺序依次尝试各解析器，返回第一个非 null 的结果
// 典型用法：环境变量优先，本地文件兜底
// @example
// const resolver = createChainedKeyResolver(
//   createEnvKeyResolver({ 'openai-completions': 'OPENAI_API_KEY' }),
//   createLocalFileKeyResolver({ filePath: '~/.vitamin/keys.json' }),
// )
export class ChainedAccessKeyResolver implements AccessKeyResolver {
  constructor(private readonly resolvers: AccessKeyResolver[]) {}

  async resolve(api: Api): Promise<string | null> {
    for (const resolver of this.resolvers) {
      const key = await resolver.resolve(api)
      if (key !== null) return key
    }
    return null
  }
}

// ─── 工厂函数 ──────────────────────────────────────────────────────────────────
// 创建环境变量解析器
export function createEnvKeyResolver(envMap: EnvKeyMap): EnvAccessKeyResolver {
  return new EnvAccessKeyResolver(envMap)
}

// 创建本地文件解析器
export function createLocalFileKeyResolver(
  options: LocalFileAccessKeyResolverOptions,
): LocalFileAccessKeyResolver {
  return new LocalFileAccessKeyResolver(options)
}

// 创建链式解析器（环境变量优先、本地文件兜底）
export function createChainedKeyResolver(
  ...resolvers: AccessKeyResolver[]
): ChainedAccessKeyResolver {
  return new ChainedAccessKeyResolver(resolvers)
}
