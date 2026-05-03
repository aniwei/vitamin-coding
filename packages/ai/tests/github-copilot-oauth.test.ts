import { describe, expect, it } from 'vitest'

import { GitHubCopilotOAuthProvider } from '../src/oauth/github-copilot'
import type { OAuthInfo } from '../src/types'

describe('GitHubCopilotOAuthProvider', () => {
  it('has correct id and name', () => {
    const provider = new GitHubCopilotOAuthProvider()

    expect(provider.id).toBe('github-copilot')
    expect(provider.name).toBe('GitHub Copilot')
  })

  it('getAccessKey returns access field', () => {
    const provider = new GitHubCopilotOAuthProvider()
    const creds = { refresh: 'gh-token', access: 'copilot-token', expires: Date.now() + 60_000 }

    expect(provider.getAccessKey(creds)).toBe('copilot-token')
  })
})

describe('GitHubCopilotOAuthProvider.refreshToken', () => {
  it('returns refreshed credentials and keeps refresh token', async () => {
    const provider = new GitHubCopilotOAuthProvider()
    const originalFetch = globalThis.fetch
    const expiresAt = Math.floor(Date.now() / 1000) + 3600

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          token: 'copilot-token',
          expires_at: expiresAt,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )

    try {
      const credentials = await provider.refreshToken({
        refresh: 'gh-token',
        access: 'old-access',
        expires: 0,
      })

      expect(credentials.refresh).toBe('gh-token')
      expect(credentials.access).toBe('copilot-token')
      // refreshToken 直接返回 expires_at，不做毫秒换算
      expect(credentials.expires).toBe(expiresAt)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws when token response fields are invalid', async () => {
    const provider = new GitHubCopilotOAuthProvider()
    const originalFetch = globalThis.fetch

    // 源码校验 !data.token，返回空对象触发错误
    globalThis.fetch = async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    try {
      await expect(
        provider.refreshToken({
          refresh: 'gh-token',
          access: 'old-access',
          expires: 0,
        }),
      ).rejects.toThrow('Invalid Copilot token response fields.')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('GitHubCopilotOAuthProvider.login', () => {
  it('completes login flow and emits auth/progress callbacks', async () => {
    const provider = new GitHubCopilotOAuthProvider()
    const authCalls: OAuthInfo[] = []
    const progressCalls: string[] = []
    const originalFetch = globalThis.fetch
    const expiresAt = Math.floor(Date.now() / 1000) + 3600

    // 按顺序模拟三次 fetch：device code → access token polling → copilot token refresh
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            device_code: 'dev-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            interval: 1,
            expires_in: 900,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      } else if (callCount === 2) {
        return new Response(
          JSON.stringify({
            access_token: 'gh-access-token',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      } else {
        return new Response(
          JSON.stringify({
            token: 'copilot-access-token',
            expires_at: expiresAt,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    try {
      const credentials = await provider.login({
        onPrompt: async () => '',
        onAuth: (info: OAuthInfo) => {
          authCalls.push(info)
        },
        onProgress: (message: string) => {
          progressCalls.push(message)
        },
      })

      expect(authCalls).toHaveLength(1)
      // onAuth 现在接收 OAuthInfo 对象
      expect(authCalls[0]?.url).toBe('https://github.com/login/device')
      expect(authCalls[0]?.code).toBe('ABCD-EFGH')
      expect(progressCalls).toContain('...')
      expect(credentials.access).toBe('copilot-access-token')
      expect(typeof credentials.expires).toBe('number')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws cancelled error when signal is already aborted', async () => {
    const provider = new GitHubCopilotOAuthProvider()
    const controller = new AbortController()
    controller.abort()

    await expect(
      provider.login({
        onPrompt: async () => '',
        onAuth: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow('Login cancelled')
  })

  it('throws when device code response is invalid', async () => {
    const provider = new GitHubCopilotOAuthProvider()
    const originalFetch = globalThis.fetch

    // 源码校验 !data.device_code，返回无该字段的响应触发错误
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: 'bad_verification_code',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )

    try {
      await expect(
        provider.login({
          onPrompt: async () => '',
          onAuth: () => {},
        }),
      ).rejects.toThrow('GitHub device authorization returned invalid response fields.')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
