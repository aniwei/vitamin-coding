import { describe, expect, it } from 'vitest'

import {
  githubCopilotOAuthProvider,
  getGitHubCopilotBaseUrl,
  normalizeDomain,
  enableGitHubCopilotModel,
  enableAllGitHubCopilotModels,
} from '../src/oauth/github-copilot'

describe('normalizeDomain', () => {
  it('extracts hostname from full URL', () => {
    expect(normalizeDomain('https://company.ghe.com/thing')).toBe('company.ghe.com')
  })

  it('handles bare hostname', () => {
    expect(normalizeDomain('company.ghe.com')).toBe('company.ghe.com')
  })

  it('returns null for empty string', () => {
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain('   ')).toBeNull()
  })
})

describe('getGitHubCopilotBaseUrl', () => {
  it('returns default URL when no token/domain', () => {
    expect(getGitHubCopilotBaseUrl()).toBe('https://api.individual.githubcopilot.com')
  })

  it('extracts base URL from proxy-ep in token', () => {
    const token = 'tid=123;exp=9999;proxy-ep=proxy.individual.githubcopilot.com;foo=bar'
    expect(getGitHubCopilotBaseUrl(token)).toBe('https://api.individual.githubcopilot.com')
  })

  it('uses enterprise domain when no token', () => {
    expect(getGitHubCopilotBaseUrl(undefined, 'company.ghe.com')).toBe(
      'https://copilot-api.company.ghe.com',
    )
  })

  it('prefers token proxy-ep over enterprise domain', () => {
    const token = 'tid=123;proxy-ep=proxy.business.githubcopilot.com;exp=9999'
    expect(getGitHubCopilotBaseUrl(token, 'company.ghe.com')).toBe(
      'https://api.business.githubcopilot.com',
    )
  })
})

describe('githubCopilotOAuthProvider', () => {
  it('has correct id and name', () => {
    expect(githubCopilotOAuthProvider.id).toBe('github-copilot')
    expect(githubCopilotOAuthProvider.name).toBe('GitHub Copilot')
  })

  it('does not use callback server (device code flow)', () => {
    expect(githubCopilotOAuthProvider.usesCallbackServer).toBeUndefined()
  })

  it('getApiKey returns access field', () => {
    const creds = { refresh: 'gh-token', access: 'copilot-token', expires: Date.now() + 60_000 }
    expect(githubCopilotOAuthProvider.getApiKey(creds)).toBe('copilot-token')
  })

  it('modifyModels sets baseUrl on copilot models', () => {
    const token = 'tid=1;proxy-ep=proxy.individual.githubcopilot.com;exp=9'
    const creds = { refresh: 'gh', access: token, expires: Date.now() + 60_000 }

    const models = [
      {
        id: 'github-copilot/gpt-4.1',
        name: 'gpt-4.1',
        api: 'github-copilot' as const,
        provider: 'github-copilot' as const,
        baseUrl: 'https://placeholder.com',
        reasoning: false,
        input: ['text'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
      {
        id: 'openai/gpt-4o',
        name: 'gpt-4o',
        api: 'openai-completions' as const,
        provider: 'openai' as const,
        baseUrl: 'https://api.openai.com',
        reasoning: false,
        input: ['text'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
    ]

    const modified = githubCopilotOAuthProvider.modifyModels!(models, creds)

    // copilot model 的 baseUrl 应被更新
    expect(modified[0].baseUrl).toBe('https://api.individual.githubcopilot.com')
    // 非 copilot model 不受影响
    expect(modified[1].baseUrl).toBe('https://api.openai.com')
  })
})

describe('enableGitHubCopilotModel', () => {
  it('returns false when network fails (no real API)', async () => {
    // 使用无效 token 调用，预期 fetch 失败返回 false
    const result = await enableGitHubCopilotModel('invalid-token', 'gpt-4.1')
    expect(result).toBe(false)
  })
})

describe('enableAllGitHubCopilotModels', () => {
  it('handles fetch failure gracefully (no crash)', async () => {
    // 使用无效 token，models 列表获取失败后应静默返回
    await expect(
      enableAllGitHubCopilotModels('invalid-token'),
    ).resolves.toBeUndefined()
  })
})
