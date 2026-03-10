import { createLogger } from '@vitamin/shared'
import { type Model, type OAuth, type OAuthCredentials } from '../types'

const logger = createLogger('@vitamin/ai:oauth')

export class GitHubCopilotOAuth implements OAuth {
  readonly id: string = 'github-copilot'
  readonly displayName: string = 'GitHub Copilot OAuth'
  
  credentials: OAuthCredentials | undefined

  async refresh(): Promise<void> {
    logger.debug('Refreshing gitHub copilot oauth token')

    // TODO 实现 OAuth 刷新流程，获取新 token 并 yield 相关事件
    this.credentials = {
      type: 'github-copilot',
      refreshToken: '',
      accessToken: '',
      expires: Date.now() + 3600 * 1000, // 1 小时后过期
    }
  }

  async resolve(): Promise<string> {
    logger.debug('Resolving gitHub copilot oauth token')

    if (!this.credentials) {
      this.credentials = await this.authorize({} as Model)
    }

    return this.credentials?.accessToken ?? ''
  }

  async authorize(model: Model): Promise<OAuthCredentials> {
    logger.debug('Authorizing gitHub copilot oauth')
    
    // TODO 实现 OAuth 授权流程，获取 token 并 yield 相关事件
    return {
      type: 'github-copilot',
      refreshToken: '',
      accessToken: '',
      expires: Date.now() + 3600 * 1000, // 1 小时后过期
    }
  }
}