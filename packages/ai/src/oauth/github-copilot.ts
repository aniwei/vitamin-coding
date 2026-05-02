import { GITHUB_CLIENT_ID, GITHUB_COPILOT_USER_AGENT, GITHUB_SCOPE } from '@x-mars/env'
import { createLogger, OAuthError } from '@x-mars/shared'
import type {
  OAuthLoginOptions,
  OAuthCredentials,
  OAuthProvider,
  OAuthRefreshTokenOptions,
} from '../types'

const logger = createLogger('@x-mars/ai:oauth:github-copilot')

type DeviceResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

type AccessTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
  interval?: number
  success: boolean
}

type RefreshTokenResponse = {
  token: string
  expires_at: number
}

export class GitHubCopilotOAuthProvider implements OAuthProvider {
  readonly id = 'github-copilot'
  readonly name = 'GitHub Copilot'

  async refreshToken(options: OAuthRefreshTokenOptions): Promise<OAuthCredentials> {
    const response = await fetch(
      `https://api.${options.domain ?? 'github.com'}/copilot_internal/v2/token`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${options.refresh}`,
          'User-Agent': GITHUB_COPILOT_USER_AGENT,
        },
      },
    )

    const data = (await response.json()) as RefreshTokenResponse
    if (!data.token) {
      throw new OAuthError('Invalid Copilot token response fields.', {
        code: 'OAUTH_REFRESH_FAILED',
      })
    }

    return {
      access: data.token as string,
      refresh: options.refresh,
      expires: data.expires_at,
    }
  }

  async login(options: OAuthLoginOptions): Promise<OAuthCredentials> {
    const input = await options.onPrompt({
      message: 'GitHub Enterprise URL/domain (blank for github.com)',
      placeholder: 'company.ghe.com',
      allowEmpty: true,
    })

    if (options.signal?.aborted) {
      throw new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' })
    }

    const trimmed = input.trim() || 'github.com'
    const url =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`)

    const device = await this.oauth(url.hostname)
    await options.onAuth({
      url: device.verification_uri,
      code: device.user_code,
      instructions: `Enter code: ${device.user_code}`,
    })

    const refreshToken = await this.pollingAccessToken(
      url.hostname,
      device.device_code,
      device.interval,
      device.expires_in,
      options.signal,
    )

    const credentials = await this.refreshToken({
      domain: url.hostname,
      access: refreshToken,
      refresh: refreshToken,
      expires: 0,
    })

    // TODO
    await options.onProgress?.('...')

    logger.info('GitHub Copilot OAuth login completed')
    return credentials
  }

  getAccessKey(credentials: OAuthCredentials): string {
    return credentials.access
  }

  private async oauth(domain: string = 'github.com'): Promise<DeviceResponse> {
    const response = await fetch(`https://${domain}/login/device/code`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': GITHUB_COPILOT_USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_SCOPE,
      }),
    })

    const data = (await response.json()) as DeviceResponse

    if (!data.device_code) {
      throw new OAuthError('GitHub device authorization returned invalid response fields.', {
        code: 'OAUTH_AUTHORIZE_FAILED',
      })
    }

    return data
  }

  private abortableSleep(timeout: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' }))
      } else {
        const timeoutId = setTimeout(resolve, timeout)

        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeoutId)
            reject(new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' }))
          },
          { once: true },
        )
      }
    })
  }

  private async pollingAccessToken(
    domain: string,
    deviceCode: string,
    delay: number,
    expiresIn: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const deadline = Date.now() + expiresIn * 1000

    const sleep = async (timeout: number) => {
      const remain = Math.min(Math.max(1000, Math.floor(timeout * 1000)), deadline - Date.now())

      await this.abortableSleep(remain, signal)
    }

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new OAuthError('Login cancelled', { code: 'OAUTH_CANCELLED' })
      }

      const response = await fetch(`https://${domain}/login/oauth/access_token`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': GITHUB_COPILOT_USER_AGENT,
        },
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })

      const data = (await response.json()) as AccessTokenResponse

      if (data.error) {
        const error = data.error
        if (error === 'authorization_pending') {
          await sleep(delay)
          continue
        } else if (error === 'slow_down') {
          await sleep((delay = delay + 5))
          continue
        }

        throw new OAuthError(
          `Authorize failed: ${error}${data.error_description ? `: ${data.error_description}` : ''}`,
          {
            code: 'OAUTH_AUTHORIZE_FAILED',
          },
        )
      }

      return data.access_token as string
    }

    throw new OAuthError('Timed out while waiting for GitHub device authorization.', {
      code: 'OAUTH_AUTHORIZE_TIMEOUT',
    })
  }
}
